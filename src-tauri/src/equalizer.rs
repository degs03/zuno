/*!
 * Ten-band graphic equaliser.
 *
 * A cascade of peaking biquads between the decoder and the deck. This is only possible at all
 * because the Rust engine owns the samples: the IFrame player never exposes them, and the
 * `<audio>` path would need a second implementation in Web Audio.
 *
 * The settings are process-global rather than per-source. Two decks are live during a crossfade
 * and both have to sound the same, and a slider has to move the track *playing*, not the next
 * one — so a source reads shared state rather than capturing gains when it was built.
 */

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use rodio::{ChannelCount, SampleRate, Source};

/// ISO octave centres. The familiar ten sliders.
pub(crate) const BAND_HZ: [f32; 10] =
    [31.0, 62.0, 125.0, 250.0, 500.0, 1_000.0, 2_000.0, 4_000.0, 8_000.0, 16_000.0];
pub(crate) const BAND_COUNT: usize = BAND_HZ.len();

/**
 * Q for one-octave bands: `1 / (2 * sinh(ln2 / 2 * bandwidth))` with bandwidth 1.
 *
 * Wider (lower Q) and neighbouring sliders fight each other, so moving one visibly changes two;
 * narrower and a boost is a whistle rather than a tone control.
 */
const BAND_Q: f32 = std::f32::consts::SQRT_2;

/// Gains beyond this are not tone control any more, and the preamp cannot buy back the headroom.
const MAX_GAIN_DB: f32 = 12.0;

/**
 * Below this magnitude a sample is closer to silence than to signal — and closer to a
 * denormal than either.
 *
 * A recursive filter fed quiet audio rings its history down toward zero exponentially, which
 * means it eventually crosses into subnormal range and can sit there for a long stretch of a
 * fade-out or a quiet intro. x86 FPUs drop to a microcode path for subnormals that can cost an
 * order of magnitude more than a normal float op — on the real-time mixing thread, ten bands
 * deep, that is a stall a listener can hear as a stutter. Flushing below this floor costs
 * nothing audible and keeps every filter on the fast path.
 */
const DENORMAL_FLOOR: f32 = 1e-15;

#[inline]
fn flush_denormal(value: f32) -> f32 {
    if value.abs() < DENORMAL_FLOOR {
        0.0
    } else {
        value
    }
}

#[derive(Clone, Copy, PartialEq)]
pub(crate) struct EqualizerValues {
    pub(crate) preamp_db: f32,
    pub(crate) bands_db: [f32; BAND_COUNT],
}

impl EqualizerValues {
    pub(crate) const FLAT: Self = Self { preamp_db: 0.0, bands_db: [0.0; BAND_COUNT] };

    /// Nothing to do — the filters are bypassed entirely rather than run at unity.
    fn is_flat(&self) -> bool {
        self.preamp_db == 0.0 && self.bands_db.iter().all(|gain| *gain == 0.0)
    }

    fn clamped(mut self) -> Self {
        self.preamp_db = self.preamp_db.clamp(-MAX_GAIN_DB, MAX_GAIN_DB);
        for gain in &mut self.bands_db {
            *gain = gain.clamp(-MAX_GAIN_DB, MAX_GAIN_DB);
        }
        self
    }
}

/**
 * Tone and stereo controls that sit beside the ten bands: a bass and a treble shelf, left/right
 * balance and stereo width. Neutral is exactly transparent and skipped like a flat EQ.
 */
#[derive(Clone, Copy, PartialEq)]
pub(crate) struct EffectsValues {
    /// Low shelf at `BASS_SHELF_HZ`, 0..+12 dB (a cut is what the bands are for).
    pub(crate) bass_db: f32,
    /// High shelf at `TREBLE_SHELF_HZ`, -12..+12 dB.
    pub(crate) treble_db: f32,
    /// -1 is left only, +1 right only. The louder side never gets louder than unity.
    pub(crate) balance: f32,
    /// Side-channel scale: 0 mono, 1 untouched, 2 twice as wide.
    pub(crate) width: f32,
}

impl EffectsValues {
    pub(crate) const NEUTRAL: Self = Self { bass_db: 0.0, treble_db: 0.0, balance: 0.0, width: 1.0 };

    pub(crate) fn clamped(self) -> Self {
        let finite = |value: f32, fallback: f32| if value.is_finite() { value } else { fallback };
        Self {
            bass_db: finite(self.bass_db, 0.0).clamp(0.0, MAX_GAIN_DB),
            treble_db: finite(self.treble_db, 0.0).clamp(-MAX_GAIN_DB, MAX_GAIN_DB),
            balance: finite(self.balance, 0.0).clamp(-1.0, 1.0),
            width: finite(self.width, 1.0).clamp(0.0, 2.0),
        }
    }

    fn has_shelves(&self) -> bool {
        self.bass_db != 0.0 || self.treble_db != 0.0
    }

    fn has_stereo(&self) -> bool {
        self.balance != 0.0 || self.width != 1.0
    }
}

const BASS_SHELF_HZ: f32 = 90.0;
const TREBLE_SHELF_HZ: f32 = 8_000.0;
/// Butterworth-ish shelf slope: no bump at the corner, so "+6 bass" is just more bass.
const SHELF_Q: f32 = std::f32::consts::FRAC_1_SQRT_2;

struct EqualizerState {
    /**
     * Bumped on every change.
     *
     * A live source checks this per sample — one relaxed atomic load, a few nanoseconds — and
     * only takes the lock when it actually moved. Locking per sample on the mixing thread would
     * put a mutex in the audio path, which is the one place it must not be.
     */
    generation: AtomicU64,
    values: Mutex<EqualizerValues>,
    effects: Mutex<EffectsValues>,
}

static EQUALIZER: EqualizerState = EqualizerState {
    generation: AtomicU64::new(0),
    values: Mutex::new(EqualizerValues::FLAT),
    effects: Mutex::new(EffectsValues::NEUTRAL),
};

pub(crate) fn set_effects(effects: EffectsValues) {
    if let Ok(mut guard) = EQUALIZER.effects.lock() {
        *guard = effects.clamped();
    }
    EQUALIZER.generation.fetch_add(1, Ordering::Release);
}

pub(crate) fn effects() -> EffectsValues {
    EQUALIZER
        .effects
        .lock()
        .map(|guard| *guard)
        .unwrap_or(EffectsValues::NEUTRAL)
}

/// Whether each track's loudness gain applies (#181). Toggling it retunes live sources too.
static NORMALIZE: AtomicBool = AtomicBool::new(false);

/**
 * Bit-perfect (DAC) mode: every sample leaves this stage exactly as it was decoded — no preamp,
 * bands, shelves, stereo, loudness gain. The engine also pins volume and speed to unity and
 * opens the device at the track's own sample rate (audio.rs), so nothing in the app alters it.
 */
static BIT_PERFECT: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_bit_perfect(enabled: bool) {
    BIT_PERFECT.store(enabled, Ordering::Release);
    EQUALIZER.generation.fetch_add(1, Ordering::Release);
}

pub(crate) fn bit_perfect() -> bool {
    BIT_PERFECT.load(Ordering::Acquire)
}

pub(crate) fn set_normalize(enabled: bool) {
    NORMALIZE.store(enabled, Ordering::Release);
    EQUALIZER.generation.fetch_add(1, Ordering::Release);
}

/// The deck's pitch ratio, as f32 bits. 1.0 by default.
static PITCH_RATIO: AtomicU32 = AtomicU32::new(0x3f80_0000);

/**
 * Tells the equaliser how far the deck resamples for pitch.
 *
 * The EQ runs before the deck's pitch resampling, which scales every frequency by the ratio —
 * at +12 semitones the "1 kHz" band would really boost 2 kHz. Designing each band at
 * `centre / ratio` puts it back where its label says, whatever the pitch.
 */
pub(crate) fn set_pitch_ratio(ratio: f32) {
    let ratio = if ratio.is_finite() && ratio > 0.0 { ratio } else { 1.0 };
    if PITCH_RATIO.swap(ratio.to_bits(), Ordering::AcqRel) != ratio.to_bits() {
        EQUALIZER.generation.fetch_add(1, Ordering::Release);
    }
}

/**
 * The gain that brings a track to YouTube's loudness reference: `loudness_db` above it is turned
 * down, quieter tracks are left alone.
 *
 * ponytail: attenuation only, as YouTube's own player does. Boosting quiet tracks would lean on
 * the limiter and pump; add a capped boost if quiet tracks turn out to matter.
 */
fn loudness_gain(loudness_db: Option<f32>) -> f32 {
    loudness_db.filter(|db| db.is_finite()).map_or(1.0, |db| 10f32.powf(-db.max(0.0) / 20.0))
}

pub(crate) fn set_values(values: EqualizerValues) {
    if let Ok(mut guard) = EQUALIZER.values.lock() {
        *guard = values.clamped();
    }
    // Published after the write, so a source that sees the new generation sees the new values.
    EQUALIZER.generation.fetch_add(1, Ordering::Release);
}

pub(crate) fn values() -> EqualizerValues {
    EQUALIZER
        .values
        .lock()
        .map(|guard| *guard)
        .unwrap_or(EqualizerValues::FLAT)
}

/**
 * One peaking filter, direct form I.
 *
 * The coefficients are the RBJ cookbook's peaking EQ. Direct form I rather than II because it
 * holds its state in the input and output history, which stays well behaved when the
 * coefficients change under it — and here they change every time a slider moves, mid-note.
 */
#[derive(Clone, Copy)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl Biquad {
    const PASSTHROUGH: Self = Self {
        b0: 1.0,
        b1: 0.0,
        b2: 0.0,
        a1: 0.0,
        a2: 0.0,
        x1: 0.0,
        x2: 0.0,
        y1: 0.0,
        y2: 0.0,
    };

    fn peaking(frequency: f32, sample_rate: f32, gain_db: f32) -> Self {
        // Above Nyquist there is nothing to boost, and the coefficients go to nonsense.
        if gain_db == 0.0 || frequency >= sample_rate / 2.0 {
            return Self::PASSTHROUGH;
        }

        let amplitude = 10f32.powf(gain_db / 40.0);
        let omega = std::f32::consts::TAU * frequency / sample_rate;
        let (sin, cos) = omega.sin_cos();
        let alpha = sin / (2.0 * BAND_Q);

        let a0 = 1.0 + alpha / amplitude;
        Self {
            b0: (1.0 + alpha * amplitude) / a0,
            b1: (-2.0 * cos) / a0,
            b2: (1.0 - alpha * amplitude) / a0,
            a1: (-2.0 * cos) / a0,
            a2: (1.0 - alpha / amplitude) / a0,
            // History is deliberately preserved by the caller; only the coefficients are new.
            ..Self::PASSTHROUGH
        }
    }

    /// RBJ cookbook shelf. `low` picks the low shelf, otherwise the high one.
    fn shelf(low: bool, frequency: f32, sample_rate: f32, gain_db: f32) -> Self {
        if gain_db == 0.0 || frequency >= sample_rate / 2.0 {
            return Self::PASSTHROUGH;
        }
        let a = 10f32.powf(gain_db / 40.0);
        let omega = std::f32::consts::TAU * frequency / sample_rate;
        let (sin, cos) = omega.sin_cos();
        let alpha = sin / (2.0 * SHELF_Q);
        let root = 2.0 * a.sqrt() * alpha;
        let (b0, b1, b2, a0, a1, a2) = if low {
            (
                a * ((a + 1.0) - (a - 1.0) * cos + root),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                a * ((a + 1.0) - (a - 1.0) * cos - root),
                (a + 1.0) + (a - 1.0) * cos + root,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                (a + 1.0) + (a - 1.0) * cos - root,
            )
        } else {
            (
                a * ((a + 1.0) + (a - 1.0) * cos + root),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                a * ((a + 1.0) + (a - 1.0) * cos - root),
                (a + 1.0) - (a - 1.0) * cos + root,
                2.0 * ((a - 1.0) - (a + 1.0) * cos),
                (a + 1.0) - (a - 1.0) * cos - root,
            )
        };
        Self { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, ..Self::PASSTHROUGH }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        // The returned value feeds the next band's `input` in the cascade — flushing only the
        // stored state and handing back the raw one would carry the denormal straight into the
        // next filter's arithmetic instead of stopping it here.
        self.y1 = flush_denormal(output);
        self.y1
    }

    fn clear_history(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }

    /// Swaps in new coefficients without disturbing the sample history, so a slider moved during
    /// a note retunes the filter rather than restarting it with a click.
    fn retune(&mut self, next: Self) {
        self.b0 = next.b0;
        self.b1 = next.b1;
        self.b2 = next.b2;
        self.a1 = next.a1;
        self.a2 = next.a2;
    }
}

/// Wraps a decoded stream in the equaliser. Cheap when flat: the filters are skipped entirely.
pub(crate) struct EqualizedSource<S> {
    inner: S,
    sample_rate: f32,
    /// Per channel, because a biquad's history is per signal — sharing one across an interleaved
    /// stream filters left against right and produces a mess.
    filters: Vec<[Biquad; BAND_COUNT]>,
    channel_index: usize,
    /// The preamp times the loudness gain while normalisation is on.
    gain: f32,
    loudness_gain: f32,
    bypass: bool,
    generation: u64,
    /// Indices of the bands that actually filter. A 0 dB band is a passthrough biquad, and
    /// running it anyway was five multiply-adds per sample for nothing.
    active: [usize; BAND_COUNT],
    active_len: usize,
    /// Samples until the settings generation is checked again.
    recheck_in: u32,
    /// Bass and treble shelves, per channel like the bands.
    shelves: Vec<[Biquad; 2]>,
    shelves_active: bool,
    /// Balance/width need a whole stereo frame, so left is processed with right in hand and
    /// right is handed out on the following call.
    stereo_active: bool,
    balance_gains: (f32, f32),
    width: f32,
    pending_right: Option<f32>,
    /// "Made for you" measurement of the decoded signal (analysis.rs); idle unless asked for.
    analyzer: crate::analysis::Analyzer,
}

/// How often a playing source looks for new EQ settings: ~3 ms at 48 kHz stereo, far below
/// anything a slider drag can be heard to lag by, and one atomic load instead of 256.
const RECHECK_EVERY: u32 = 256;

impl<S: Source> EqualizedSource<S> {
    pub(crate) fn new(inner: S, loudness_db: Option<f32>) -> Self {
        let channels = inner.channels().get() as usize;
        let sample_rate = inner.sample_rate().get() as f32;
        let mut source = Self {
            inner,
            sample_rate,
            filters: vec![[Biquad::PASSTHROUGH; BAND_COUNT]; channels.max(1)],
            channel_index: 0,
            gain: 1.0,
            loudness_gain: loudness_gain(loudness_db),
            bypass: true,
            // Not the live generation: starting one behind forces the first sample to load
            // whatever the user already had set before this track began.
            generation: u64::MAX,
            active: [0; BAND_COUNT],
            active_len: 0,
            recheck_in: 0,
            shelves: vec![[Biquad::PASSTHROUGH; 2]; channels.max(1)],
            shelves_active: false,
            stereo_active: false,
            balance_gains: (1.0, 1.0),
            width: 1.0,
            pending_right: None,
            analyzer: crate::analysis::Analyzer::new(sample_rate),
        };
        source.reload();
        source
    }

    fn reload(&mut self) {
        self.generation = EQUALIZER.generation.load(Ordering::Acquire);
        if bit_perfect() {
            // Unity and untouched: the fast path in `next` returns each sample as decoded.
            self.gain = 1.0;
            self.bypass = true;
            self.shelves_active = false;
            self.stereo_active = false;
            return;
        }
        let values = values();
        let normalize = if NORMALIZE.load(Ordering::Acquire) { self.loudness_gain } else { 1.0 };
        self.gain = 10f32.powf(values.preamp_db / 20.0) * normalize;
        self.reload_effects();
        let was_bypassed = self.bypass;
        self.bypass = values.is_flat();
        if self.bypass {
            return;
        }

        let pitch = f32::from_bits(PITCH_RATIO.load(Ordering::Acquire));
        // A copy of a small fixed array, not a Vec: this runs on the audio thread.
        let (previous, previous_len) = (self.active, self.active_len);
        let previously_active = &previous[..previous_len];
        self.active_len = 0;
        for band in 0..BAND_COUNT {
            let centre = BAND_HZ[band] / pitch;
            let next = Biquad::peaking(centre, self.sample_rate, values.bands_db[band]);
            let filters = next.b0 != 1.0 || next.b1 != 0.0 || next.b2 != 0.0;
            if filters {
                self.active[self.active_len] = band;
                self.active_len += 1;
            }
            /*
             * A band that is (re)joining the cascade starts from silence instead of whatever it
             * last held — after a bypass that history is minutes stale and plays as a click.
             * A band that keeps filtering keeps its history, so a slider drag retunes smoothly.
             */
            let joining = filters && (was_bypassed || !previously_active.contains(&band));
            for channel in &mut self.filters {
                channel[band].retune(next);
                if joining {
                    channel[band].clear_history();
                }
            }
        }
    }

    fn reload_effects(&mut self) {
        let effects = effects();
        let pitch = f32::from_bits(PITCH_RATIO.load(Ordering::Acquire));
        let was_active = self.shelves_active;
        self.shelves_active = effects.has_shelves();
        let bass = Biquad::shelf(true, BASS_SHELF_HZ / pitch, self.sample_rate, effects.bass_db);
        let treble = Biquad::shelf(false, TREBLE_SHELF_HZ / pitch, self.sample_rate, effects.treble_db);
        for channel in &mut self.shelves {
            channel[0].retune(bass);
            channel[1].retune(treble);
            if self.shelves_active && !was_active {
                channel[0].clear_history();
                channel[1].clear_history();
            }
        }
        // Stereo controls only mean something on a two-channel stream.
        self.stereo_active = self.filters.len() == 2 && effects.has_stereo();
        let balance = effects.balance;
        self.balance_gains = (
            if balance > 0.0 { 1.0 - balance } else { 1.0 },
            if balance < 0.0 { 1.0 + balance } else { 1.0 },
        );
        self.width = effects.width;
    }

    /// Gain, bands and shelves for one sample of one channel.
    #[inline]
    fn filter(&mut self, channel: usize, sample: f32) -> f32 {
        let mut output = sample * self.gain;
        if !self.bypass {
            let filters = &mut self.filters[channel];
            for &band in &self.active[..self.active_len] {
                output = filters[band].process(output);
            }
        }
        if self.shelves_active {
            let shelves = &mut self.shelves[channel];
            let bassed = shelves[0].process(output);
            output = shelves[1].process(bassed);
        }
        output
    }

    /// Mid/side width, then balance.
    #[inline]
    fn stereo(&self, left: f32, right: f32) -> (f32, f32) {
        let mid = (left + right) * 0.5;
        let side = (left - right) * 0.5 * self.width;
        ((mid + side) * self.balance_gains.0, (mid - side) * self.balance_gains.1)
    }

    #[inline]
    fn tick(&mut self) {
        if self.recheck_in == 0 {
            self.recheck_in = RECHECK_EVERY;
            if self.generation != EQUALIZER.generation.load(Ordering::Acquire) {
                self.reload();
            }
        }
        self.recheck_in -= 1;
    }
}

impl<S: Source> Iterator for EqualizedSource<S> {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
        if let Some(right) = self.pending_right.take() {
            return Some(right);
        }
        let sample = self.inner.next()?;
        self.tick();
        // Counted while bypassed too, or turning the EQ on mid-track filters left as right.
        let channel = self.channel_index;
        self.channel_index = (self.channel_index + 1) % self.filters.len();
        // Measured before any processing, so the user's own EQ never colours it.
        if channel == 0 && crate::analysis::active() {
            self.analyzer.feed(sample);
        }
        if self.bypass && !self.shelves_active && !self.stereo_active {
            return Some(sample * self.gain);
        }

        let output = self.filter(channel, sample);
        if !(self.stereo_active && channel == 0) {
            return Some(output);
        }
        // Left in hand: pull its right partner so the frame can be widened and balanced.
        let Some(right) = self.inner.next() else {
            return Some(output);
        };
        self.tick();
        self.channel_index = (self.channel_index + 1) % self.filters.len();
        let right = self.filter(1, right);
        let (left, right) = self.stereo(output, right);
        self.pending_right = Some(right);
        Some(left)
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

impl<S: Source> Source for EqualizedSource<S> {
    #[inline]
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    #[inline]
    fn channels(&self) -> ChannelCount {
        self.inner.channels()
    }

    #[inline]
    fn sample_rate(&self) -> SampleRate {
        self.inner.sample_rate()
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, position: Duration) -> Result<(), rodio::source::SeekError> {
        self.inner.try_seek(position)?;
        /*
         * The filter history describes audio from before the jump. Carrying it across is a
         * transient built from samples that are no longer adjacent — a thump on every seek.
         */
        for channel in &mut self.filters {
            for filter in channel.iter_mut() {
                filter.clear_history();
            }
        }
        for channel in &mut self.shelves {
            for filter in channel.iter_mut() {
                filter.clear_history();
            }
        }
        self.pending_right = None;
        self.channel_index = 0;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        flush_denormal, loudness_gain, Biquad, EffectsValues, EqualizerValues, BAND_COUNT, BAND_HZ,
        MAX_GAIN_DB,
    };

    #[test]
    fn shelves_lift_their_own_end_of_the_spectrum() {
        let rate = 48_000.0;
        let bass = Biquad::shelf(true, 90.0, rate, 12.0);
        assert!(response_at(bass, 40.0, rate) > 3.0, "bass shelf lifts 40 Hz");
        assert!(response_at(bass, 4_000.0, rate) < 1.1, "bass shelf leaves 4 kHz alone");
        let treble = Biquad::shelf(false, 8_000.0, rate, 12.0);
        assert!(response_at(treble, 16_000.0, rate) > 3.0, "treble shelf lifts 16 kHz");
        assert!(response_at(treble, 200.0, rate) < 1.1, "treble shelf leaves 200 Hz alone");
        assert_eq!(Biquad::shelf(true, 90.0, rate, 0.0).b0, 1.0, "0 dB shelf is a passthrough");
    }

    #[test]
    fn effects_clamp_and_neutral_is_neutral() {
        let neutral = EffectsValues::NEUTRAL;
        assert!(!neutral.has_shelves() && !neutral.has_stereo());
        let wild = EffectsValues { bass_db: -5.0, treble_db: 40.0, balance: 3.0, width: f32::NAN }.clamped();
        assert_eq!(wild.bass_db, 0.0);
        assert_eq!(wild.treble_db, MAX_GAIN_DB);
        assert_eq!(wild.balance, 1.0);
        assert_eq!(wild.width, 1.0);
    }

    /// A value below the floor lands on exact zero; an audible one passes through untouched,
    /// regardless of sign.
    #[test]
    fn denormals_are_flushed_to_exact_zero() {
        assert_eq!(flush_denormal(1e-20), 0.0, "well below the floor must flush");
        assert_eq!(flush_denormal(f32::MIN_POSITIVE / 2.0), 0.0, "an actual subnormal must flush");
        assert_eq!(flush_denormal(-1e-20), 0.0, "flushing must not care about sign");
        assert_eq!(flush_denormal(0.5), 0.5, "an audible value must pass through unchanged");
        assert_eq!(flush_denormal(-0.5), -0.5);
    }

    /// A filter fed silence after a transient must ring its state down to exact zero rather
    /// than lingering as a denormal — see `flush_denormal`.
    #[test]
    fn a_filter_settles_to_exact_zero_instead_of_ringing_forever() {
        let mut filter = Biquad::peaking(1_000.0, 48_000.0, 12.0);
        filter.process(1.0);
        for _ in 0..10_000 {
            filter.process(0.0);
        }
        assert_eq!(filter.y1, 0.0);
        assert_eq!(filter.y2, 0.0);
    }

    /// Runs a sine through a filter and returns its amplitude once the state has settled.
    fn response_at(mut filter: Biquad, frequency: f32, sample_rate: f32) -> f32 {
        let step = std::f32::consts::TAU * frequency / sample_rate;
        // Long enough for the transient to decay before anything is measured.
        for n in 0..4_000 {
            filter.process((n as f32 * step).sin());
        }
        let mut peak = 0.0f32;
        for n in 4_000..8_000 {
            peak = peak.max(filter.process((n as f32 * step).sin()).abs());
        }
        peak
    }

    /**
     * A band boosts its own centre and leaves the far end of the spectrum alone.
     *
     * The arithmetic is easy to get subtly wrong — a swapped sign or a missed `a0` division
     * produces a filter that still runs and still makes sound, just the wrong sound, which is
     * exactly the kind of bug that survives to a release.
     */
    #[test]
    fn a_band_boosts_its_own_centre_and_leaves_the_rest_alone() {
        let sample_rate = 48_000.0;
        let boosted = Biquad::peaking(1_000.0, sample_rate, 12.0);

        let at_centre = response_at(boosted, 1_000.0, sample_rate);
        // +12 dB is a gain of about 4. Generous bounds: this is checking the shape, not the ripple.
        assert!(
            at_centre > 3.5 && at_centre < 4.5,
            "+12 dB at the centre should be roughly 4x, got {at_centre}",
        );

        let far_below = response_at(boosted, 60.0, sample_rate);
        let far_above = response_at(boosted, 16_000.0, sample_rate);
        assert!(far_below < 1.2, "a 1 kHz band must not lift 60 Hz: {far_below}");
        assert!(far_above < 1.2, "a 1 kHz band must not lift 16 kHz: {far_above}");

        // A cut is the same filter with the gain the other way.
        let cut = response_at(Biquad::peaking(1_000.0, sample_rate, -12.0), 1_000.0, sample_rate);
        assert!(cut > 0.2 && cut < 0.3, "-12 dB should be roughly a quarter, got {cut}");
    }

    /// Zero gain must be exactly transparent, and a band above Nyquist must not produce garbage.
    #[test]
    fn nothing_to_do_means_nothing_is_done() {
        let flat = Biquad::peaking(1_000.0, 48_000.0, 0.0);
        assert_eq!(flat.b0, 1.0);
        assert_eq!(flat.b1, 0.0);
        assert_eq!(flat.a1, 0.0);

        // 16 kHz has no meaning at an 8 kHz sample rate; the coefficients would be nonsense.
        let above_nyquist = Biquad::peaking(16_000.0, 8_000.0, 12.0);
        assert_eq!(above_nyquist.b0, 1.0);
        let passed = response_at(above_nyquist, 1_000.0, 8_000.0);
        assert!((passed - 1.0).abs() < 0.01, "a disabled band is unity gain, got {passed}");
    }

    #[test]
    fn loudness_above_the_reference_is_turned_down_and_below_it_left_alone() {
        assert!((loudness_gain(Some(6.0)) - 0.501).abs() < 0.001, "+6 dB loud halves amplitude");
        assert_eq!(loudness_gain(Some(-4.0)), 1.0, "a quiet track is never boosted");
        assert_eq!(loudness_gain(None), 1.0, "no measurement, no change");
        assert_eq!(loudness_gain(Some(f32::NAN)), 1.0);
    }

    #[test]
    fn gains_are_clamped_and_flat_is_recognised() {
        assert!(EqualizerValues::FLAT.is_flat());
        assert_eq!(BAND_HZ.len(), BAND_COUNT);

        let mut shouted = EqualizerValues::FLAT;
        shouted.preamp_db = 99.0;
        shouted.bands_db[3] = -99.0;
        let clamped = shouted.clamped();
        assert_eq!(clamped.preamp_db, MAX_GAIN_DB);
        assert_eq!(clamped.bands_db[3], -MAX_GAIN_DB);
        assert!(!clamped.is_flat(), "a clamped setting is still a setting");

        // The preamp alone counts: a pure volume trim must not be optimised away as "flat".
        let mut trimmed = EqualizerValues::FLAT;
        trimmed.preamp_db = -3.0;
        assert!(!trimmed.is_flat());
    }
}
