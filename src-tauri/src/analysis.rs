/*!
 * Listens to what is playing and measures how much energy sits in each of the EQ's ten bands.
 *
 * Feeds the "Made for you" curve: Zuno measures the songs you like and builds a curve that
 * leans into their sound. It reads the decoded signal *before* the equaliser (so your own EQ
 * does not colour the measurement) and never changes a sample. It only runs while the frontend
 * asks for it — one track at a time, songs you like only.
 *
 * Cost: ten band-pass biquads on one channel, about the price of the EQ itself, and the totals
 * reach the shared accumulator once every few thousand samples so there is no lock per sample.
 */

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use crate::equalizer::{BAND_COUNT, BAND_HZ};

static ACTIVE: AtomicBool = AtomicBool::new(false);

struct Totals {
    energy: [f64; BAND_COUNT],
    samples: u64,
}

static TOTALS: Mutex<Totals> = Mutex::new(Totals { energy: [0.0; BAND_COUNT], samples: 0 });

/// Starts (resetting) or stops the measurement.
pub(crate) fn set_active(active: bool) {
    if let Ok(mut totals) = TOTALS.lock() {
        totals.energy = [0.0; BAND_COUNT];
        totals.samples = 0;
    }
    ACTIVE.store(active, Ordering::Release);
}

#[inline]
pub(crate) fn active() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

/// Mean level per band in dB since the last reset, then resets. None with too little audio.
pub(crate) fn take_spectrum() -> Option<[f32; BAND_COUNT]> {
    let mut totals = TOTALS.lock().ok()?;
    // Under ~10 s of 44.1 kHz audio is not a fair picture of a song.
    if totals.samples < 441_000 {
        totals.energy = [0.0; BAND_COUNT];
        totals.samples = 0;
        return None;
    }
    let samples = totals.samples as f64;
    let mut out = [0.0f32; BAND_COUNT];
    for (band, energy) in totals.energy.iter().enumerate() {
        out[band] = (10.0 * (energy / samples).max(1e-12).log10()) as f32;
    }
    totals.energy = [0.0; BAND_COUNT];
    totals.samples = 0;
    Some(out)
}

/// RBJ constant-0-dB-peak band-pass.
#[derive(Clone, Copy)]
struct BandPass {
    b0: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BandPass {
    fn new(frequency: f32, sample_rate: f32) -> Self {
        let frequency = frequency.min(sample_rate * 0.45);
        let omega = std::f32::consts::TAU * frequency / sample_rate;
        let (sin, cos) = omega.sin_cos();
        let alpha = sin / (2.0 * std::f32::consts::SQRT_2);
        let a0 = 1.0 + alpha;
        Self {
            b0: alpha / a0,
            b2: -alpha / a0,
            a1: (-2.0 * cos) / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = if output.abs() < 1e-15 { 0.0 } else { output };
        self.y1
    }
}

const FLUSH_EVERY: u32 = 4_096;

/// One per playing source; feed it the first channel's samples.
pub(crate) struct Analyzer {
    bands: [BandPass; BAND_COUNT],
    energy: [f64; BAND_COUNT],
    pending: u32,
}

impl Analyzer {
    pub(crate) fn new(sample_rate: f32) -> Self {
        let mut bands = [BandPass::new(1_000.0, sample_rate); BAND_COUNT];
        for (band, filter) in bands.iter_mut().enumerate() {
            *filter = BandPass::new(BAND_HZ[band], sample_rate);
        }
        Self { bands, energy: [0.0; BAND_COUNT], pending: 0 }
    }

    #[inline]
    pub(crate) fn feed(&mut self, sample: f32) {
        for (band, filter) in self.bands.iter_mut().enumerate() {
            let value = filter.process(sample) as f64;
            self.energy[band] += value * value;
        }
        self.pending += 1;
        if self.pending >= FLUSH_EVERY {
            self.flush();
        }
    }

    fn flush(&mut self) {
        if let Ok(mut totals) = TOTALS.try_lock() {
            for band in 0..BAND_COUNT {
                totals.energy[band] += self.energy[band];
            }
            totals.samples += self.pending as u64;
            self.energy = [0.0; BAND_COUNT];
            self.pending = 0;
        }
        // Contended (a reader is taking the spectrum): keep accumulating, flush next time.
    }
}

#[cfg(test)]
mod tests {
    use super::{Analyzer, TOTALS};
    use crate::equalizer::BAND_COUNT;

    #[test]
    fn a_tone_lights_its_own_band() {
        let rate = 48_000.0;
        let mut analyzer = Analyzer::new(rate);
        if let Ok(mut totals) = TOTALS.lock() {
            totals.energy = [0.0; BAND_COUNT];
            totals.samples = 0;
        }
        let step = std::f32::consts::TAU * 1_000.0 / rate;
        for n in 0..96_000 {
            analyzer.feed((n as f32 * step).sin() * 0.5);
        }
        let energy = analyzer.energy;
        let pending = TOTALS.lock().map(|t| t.energy).unwrap_or([0.0; BAND_COUNT]);
        let total: Vec<f64> = (0..BAND_COUNT).map(|b| energy[b] + pending[b]).collect();
        // Band 5 is 1 kHz; band 1 is 62 Hz.
        assert!(total[5] > total[1] * 100.0, "1 kHz band should dominate: {total:?}");
        assert!(total[5] > total[9] * 20.0, "and not leak into 16 kHz: {total:?}");
    }
}
