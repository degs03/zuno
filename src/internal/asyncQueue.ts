/**
 * A serial queue: each call waits for the previous one to settle before it starts.
 *
 * For state that is only safe to touch one call at a time — a single mutable field two
 * concurrent async calls would otherwise race on, where the fix isn't a return value but simply
 * "don't overlap".
 */
export function createSerialQueue(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    // Chained regardless of outcome, so one failed call does not wedge every call behind it.
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/**
 * A serial queue where foreground work jumps ahead of background work that has not started.
 *
 * Built for the stream resolver: preloading the *next* track is queued as background, so a
 * track the user just tapped never waits behind it. Work already running is never interrupted —
 * only the order of what is still waiting changes. Within one priority, order is FIFO.
 */
export function createPriorityQueue(): <T>(fn: () => Promise<T>, background?: boolean) => Promise<T> {
  type Job = { run: () => Promise<void>; background: boolean };
  const pending: Job[] = [];
  let running = false;

  const pump = () => {
    if (running) return;
    const job = pending.shift();
    if (!job) return;
    running = true;
    void job.run().finally(() => {
      running = false;
      pump();
    });
  };

  return function run<T>(fn: () => Promise<T>, background = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        background,
        run: () => fn().then(resolve, reject),
      };
      if (background) {
        pending.push(job);
      } else {
        // Ahead of every waiting background job, behind earlier foreground ones.
        const firstBackground = pending.findIndex((entry) => entry.background);
        if (firstBackground === -1) pending.push(job);
        else pending.splice(firstBackground, 0, job);
      }
      pump();
    });
  };
}
