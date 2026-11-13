/*!
 * Decoding off the audio thread.
 *
 * rodio pulls samples from inside the output device's callback, so every source in a deck's
 * chain runs on that realtime thread. For the decoder that includes `BufferReader::read`, which
 * waits — up to `READ_TIMEOUT` — for bytes that are still downloading, plus libopus itself. On a
 * slow phone or a weak connection either one stalls the callback, and a stalled callback is a
 * glitch for everything mixed into it.
 *
 * `Prefetch` moves the decoder onto its own thread. That thread decodes ahead into a bounded
 * queue of fixed-size chunks (about half a second); the callback side only pops chunks. When
 * the queue is empty because the network fell behind, the callback plays silence and counts an
 * underrun instead of blocking, and picks the music back up as soon as decoding catches up.
 *
 * It sits directly on the decoder, *below* the equaliser and the `Clocked` position counter, so
 * the position the UI shows is what has actually been played, not what has been decoded ahead.
 */

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::Source;

use crate::audio::BoxedSource;

/// Samples per chunk before rounding to whole frames: ~21 ms of 48 kHz stereo.
const CHUNK_SAMPLES: usize = 2_048;
/// Chunks decoded ahead. With `CHUNK_SAMPLES` that is ~0.7 s of 48 kHz stereo, ~256 KiB.
const QUEUE_CHUNKS: usize = 32;
/// Chunks a fresh source must have before it is handed to a deck, so a track never *starts* on
/// an underrun — that would be an audible gap on every gapless handover.
const PRIME_CHUNKS: usize = 4;
/// How long the first chunk may take. Matches the reader's own patience for a slow head chunk.
const PRIME_TIMEOUT: Duration = Duration::from_secs(20);
/// Producer back-off while the queue is full or the source has ended.
const IDLE_POLL: Duration = Duration::from_millis(5);

/// Times any deck ran dry and had to play silence, since launch. Read for diagnostics.
pub(crate) static UNDERRUNS: AtomicU64 = AtomicU64::new(0);

struct Chunk {
    /// Seek generation the samples belong to. Chunks from before a seek are discarded.
    generation: u64,
    samples: Vec<f32>,
    /// The source returned `None` after these samples.
    last: bool,
}

#[derive(Default)]
struct Control {
    /// Bumped by the callback side on every seek; the producer re-seeks when it changes.
    generation: AtomicU64,
    target: Mutex<Option<Duration>>,
    /// The consumer is gone.
    stop: AtomicBool,
    /// Chunks sent so far; lets `prime` wait for a cushion without consuming it.
    produced: AtomicU64,
}

pub(crate) struct Prefetch {
    chunks: Receiver<Chunk>,
    /// Spent buffers go back to the producer, so the realtime thread never frees memory.
    recycle: SyncSender<Vec<f32>>,
    control: Arc<Control>,
    generation: u64,
    current: Vec<f32>,
    position: usize,
    current_is_last: bool,
    ended: bool,
    /// Already counted the dry spell in progress (or it is an expected one, like a seek).
    starving: bool,
    channels: rodio::ChannelCount,
    sample_rate: rodio::SampleRate,
    total_duration: Option<Duration>,
}

impl Prefetch {
    /// Starts decoding `inner` on its own thread and waits until a little of it is ready.
    ///
    /// Blocks, by design: it is called from the load's blocking task, where the decoder used to
    /// do the same wait inline for the head of the download.
    pub(crate) fn new(inner: BoxedSource) -> Result<Self, String> {
        let channels = inner.channels();
        let sample_rate = inner.sample_rate();
        let total_duration = inner.total_duration();
        let frame = channels.get().max(1) as usize;
        // Whole frames per chunk, so a chunk boundary is never mid-frame.
        let chunk_len = (CHUNK_SAMPLES / frame).max(1) * frame;

        let (chunk_tx, chunks) = mpsc::sync_channel(QUEUE_CHUNKS);
        let (recycle, recycled) = mpsc::sync_channel(QUEUE_CHUNKS);
        let control = Arc::new(Control::default());
        let producer_control = control.clone();
        std::thread::Builder::new()
            .name("zuno-decode".into())
            .spawn(move || produce(inner, chunk_len, chunk_tx, recycled, producer_control))
            .map_err(|error| format!("decode thread failed to start: {error}"))?;

        let mut source = Self {
            chunks,
            recycle,
            control,
            generation: 0,
            current: Vec::new(),
            position: 0,
            current_is_last: false,
            ended: false,
            starving: true,
            channels,
            sample_rate,
            total_duration,
        };
        source.prime()?;
        Ok(source)
    }

    /// Waits for the first chunk, then briefly for a few more, so playback starts with a cushion.
    fn prime(&mut self) -> Result<(), String> {
        let first = self
            .chunks
            .recv_timeout(PRIME_TIMEOUT)
            .map_err(|_| "timed out decoding the start of the track".to_string())?;
        self.take(first);
        // Best effort past the first: a short track may not have more, and that is fine.
        let deadline = std::time::Instant::now() + Duration::from_millis(250);
        while self.control.produced.load(Ordering::Acquire) < PRIME_CHUNKS as u64
            && !self.current_is_last
        {
            if std::time::Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(IDLE_POLL);
        }
        self.starving = false;
        Ok(())
    }

    fn take(&mut self, chunk: Chunk) {
        let spent = std::mem::replace(&mut self.current, chunk.samples);
        if spent.capacity() > 0 {
            let _ = self.recycle.try_send(spent);
        }
        self.position = 0;
        self.current_is_last = chunk.last;
    }
}

impl Drop for Prefetch {
    fn drop(&mut self) {
        self.control.stop.store(true, Ordering::Release);
    }
}

impl Iterator for Prefetch {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
        loop {
            if let Some(&sample) = self.current.get(self.position) {
                self.position += 1;
                return Some(sample);
            }
            if self.ended {
                return None;
            }
            if self.current_is_last {
                self.ended = true;
                return None;
            }
            match self.chunks.try_recv() {
                Ok(chunk) if chunk.generation != self.generation => {
                    let _ = self.recycle.try_send(chunk.samples);
                }
                Ok(chunk) => {
                    self.starving = false;
                    self.take(chunk);
                }
                Err(TryRecvError::Empty) => {
                    if !self.starving {
                        self.starving = true;
                        UNDERRUNS.fetch_add(1, Ordering::Relaxed);
                    }
                    // A frame of silence at a time keeps the channels aligned. The queue only
                    // runs dry between whole-frame chunks, so this always starts on a frame.
                    self.current.clear();
                    self.current.resize(self.channels.get().max(1) as usize, 0.0);
                    self.position = 0;
                }
                Err(TryRecvError::Disconnected) => {
                    self.ended = true;
                    return None;
                }
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (0, None)
    }
}

impl Source for Prefetch {
    fn current_span_len(&self) -> Option<usize> {
        // Unbounded; `Respan` above the deck chain bounds spans for the mixer.
        None
    }

    fn channels(&self) -> rodio::ChannelCount {
        self.channels
    }

    fn sample_rate(&self) -> rodio::SampleRate {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        self.total_duration
    }

    /// Never blocks the callback: hands the target to the decode thread and plays silence for the
    /// few milliseconds until audio from the new position arrives.
    fn try_seek(&mut self, position: Duration) -> Result<(), rodio::source::SeekError> {
        self.generation = self.generation.wrapping_add(1);
        if let Ok(mut target) = self.control.target.lock() {
            *target = Some(position);
        }
        self.control.generation.store(self.generation, Ordering::Release);
        self.current.clear();
        self.position = 0;
        self.current_is_last = false;
        self.ended = false;
        // The silence until the decoder catches up is expected, not an underrun.
        self.starving = true;
        Ok(())
    }
}

fn produce(
    mut inner: BoxedSource,
    chunk_len: usize,
    chunks: SyncSender<Chunk>,
    recycled: Receiver<Vec<f32>>,
    control: Arc<Control>,
) {
    let mut generation = 0u64;
    let mut ended = false;
    loop {
        if control.stop.load(Ordering::Acquire) {
            return;
        }
        let requested = control.generation.load(Ordering::Acquire);
        if requested != generation {
            generation = requested;
            let target = control.target.lock().ok().and_then(|mut target| target.take());
            if let Some(target) = target {
                if let Err(error) = inner.try_seek(target) {
                    eprintln!("[internal][tauri][warn] native_audio seek failed: {error}");
                }
            }
            ended = false;
        }
        if ended {
            // Nothing left to decode; stay around only for a seek back into the track.
            std::thread::sleep(IDLE_POLL * 4);
            continue;
        }

        let mut samples = recycled.try_recv().unwrap_or_else(|_| Vec::with_capacity(chunk_len));
        samples.clear();
        while samples.len() < chunk_len {
            match inner.next() {
                Some(sample) => samples.push(sample),
                None => {
                    ended = true;
                    break;
                }
            }
        }

        let mut chunk = Chunk { generation, samples, last: ended };
        loop {
            match chunks.try_send(chunk) {
                Ok(()) => {
                    control.produced.fetch_add(1, Ordering::Release);
                    break;
                }
                Err(TrySendError::Disconnected(_)) => return,
                Err(TrySendError::Full(rejected)) => {
                    // A seek or a stop while waiting makes this chunk stale; drop it.
                    if control.stop.load(Ordering::Acquire)
                        || control.generation.load(Ordering::Acquire) != generation
                    {
                        ended = false;
                        break;
                    }
                    chunk = rejected;
                    std::thread::sleep(IDLE_POLL);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `len` samples counting up from 1 (so silence, 0.0, is never real), stereo 48 kHz,
    /// seekable by sample index.
    struct Counting {
        next: usize,
        len: usize,
    }

    impl Iterator for Counting {
        type Item = f32;
        fn next(&mut self) -> Option<f32> {
            (self.next < self.len).then(|| {
                self.next += 1;
                self.next as f32
            })
        }
    }

    impl Source for Counting {
        fn current_span_len(&self) -> Option<usize> {
            None
        }
        fn channels(&self) -> rodio::ChannelCount {
            rodio::ChannelCount::new(2).unwrap()
        }
        fn sample_rate(&self) -> rodio::SampleRate {
            rodio::SampleRate::new(48_000).unwrap()
        }
        fn total_duration(&self) -> Option<Duration> {
            None
        }
        fn try_seek(&mut self, position: Duration) -> Result<(), rodio::source::SeekError> {
            self.next = (position.as_secs_f64() * 96_000.0) as usize;
            Ok(())
        }
    }

    /// Pulls until `n` real (non-silence) samples arrive or the source ends, the way the
    /// callback would, tolerating the silence a not-yet-filled queue legitimately produces.
    fn pull(source: &mut Prefetch, n: usize) -> Vec<f32> {
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while out.len() < n && std::time::Instant::now() < deadline {
            match source.next() {
                Some(sample) if sample != 0.0 => out.push(sample),
                Some(_) => std::thread::yield_now(),
                None => break,
            }
        }
        out
    }

    #[test]
    fn plays_every_sample_in_order_then_ends() {
        let len = 50_000;
        let mut source = Prefetch::new(Box::new(Counting { next: 0, len })).unwrap();
        let samples = pull(&mut source, len);
        assert_eq!(samples.len(), len);
        assert!(samples.iter().enumerate().all(|(i, s)| *s == (i + 1) as f32));
        assert_eq!(source.next(), None);
    }

    #[test]
    fn a_seek_resumes_from_the_new_position() {
        let mut source = Prefetch::new(Box::new(Counting { next: 0, len: 960_000 })).unwrap();
        pull(&mut source, 10);
        source.try_seek(Duration::from_secs(5)).unwrap();
        let after = pull(&mut source, 4);
        assert_eq!(after[0], 480_001.0, "first sample after a 5 s seek");
        assert_eq!(after[3], 480_004.0);
    }

    #[test]
    fn a_track_shorter_than_a_chunk_still_plays_and_ends() {
        let mut source = Prefetch::new(Box::new(Counting { next: 0, len: 7 })).unwrap();
        assert_eq!(pull(&mut source, 7), (1..=7).map(|i| i as f32).collect::<Vec<_>>());
        assert_eq!(source.next(), None);
    }
}
