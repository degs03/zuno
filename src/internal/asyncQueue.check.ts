/**
 * Self-check for the serial queue.
 *
 * Built for exactly one failure mode: two calls overlapping and touching shared mutable state in
 * the gap (see `YouTubeMusicDataSource.withDownloadLock`). A queue that lets two `fn`s run
 * concurrently, or that wedges forever after one throws, is worse than no queue at all — both
 * fail silently until something downstream (a 403, a hang) points nowhere near here.
 */
export {};

import { createPriorityQueue, createSerialQueue } from "./asyncQueue";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Calls never overlap: the second's body must not start before the first's finishes.
  {
    const run = createSerialQueue();
    let active = 0;
    let sawOverlap = false;
    const task = async (ms: number) => {
      active++;
      if (active > 1) sawOverlap = true;
      await delay(ms);
      active--;
    };
    await Promise.all([run(() => task(20)), run(() => task(1)), run(() => task(1))]);
    check(!sawOverlap, "two queued calls ran at the same time");
  }

  // Each caller gets its own result back, not another call's.
  {
    const run = createSerialQueue();
    const [a, b, c] = await Promise.all([
      run(async () => "a"),
      run(async () => "b"),
      run(async () => "c"),
    ]);
    equal(a, "a", "first caller's own result");
    equal(b, "b", "second caller's own result");
    equal(c, "c", "third caller's own result");
  }

  // A rejection is reported to its own caller and does not wedge the ones behind it.
  {
    const run = createSerialQueue();
    const failing = run(async () => {
      throw new Error("boom");
    });
    const after = run(async () => "still runs");
    await failing.catch(() => {});
    equal(await after, "still runs", "a later call survives an earlier rejection");
    let rejected = false;
    try {
      await failing;
    } catch {
      rejected = true;
    }
    check(rejected, "the failing call's own rejection reaches its caller");
  }

  // Priority queue: a foreground call overtakes background work that has not started yet,
  // but never interrupts the job already running.
  {
    const run = createPriorityQueue();
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const first = run(() => new Promise<void>((resolve) => {
      order.push("bg-running");
      releaseFirst = resolve;
    }), true);
    const bgWaiting = run(async () => { order.push("bg-waiting"); }, true);
    const fg = run(async () => { order.push("foreground"); });
    await Promise.resolve();
    releaseFirst();
    await Promise.all([first, bgWaiting, fg]);
    equal(order.join(","), "bg-running,foreground,bg-waiting", "foreground jumps waiting background work");
  }

  {
    const run = createPriorityQueue();
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => run(async () => { order.push(n); })));
    equal(order.join(","), "1,2,3", "same priority stays first-in, first-out");
    const failing = run(async () => { throw new Error("boom"); });
    await failing.catch(() => {});
    equal(await run(async () => "ok"), "ok", "a rejection does not wedge the priority queue");
  }

  {
    const run = createPriorityQueue(20);
    const hung = run(() => new Promise<string>(() => {}));
    let timedOut = false;
    await hung.catch(() => { timedOut = true; });
    check(timedOut, "a hung job is rejected after the timeout");
    equal(await run(async () => "next"), "next", "a hung job does not wedge the jobs behind it");
  }
}

await main();
console.log("asyncQueue.check.ts passed");
