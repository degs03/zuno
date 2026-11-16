import { useEffect, useRef, useState } from "react";

/**
 * Renders a long list in pages: the first `initial` items at once, then `step` more each time
 * the sentinel (an empty element after the last rendered item) scrolls within ~1.5 screens.
 *
 * A library of a few thousand songs used to mount every row on open, which is what made
 * reaching the Library tab stall on phones. The visible part now mounts immediately and the
 * rest arrives before the user can scroll to it. `resetKey` (e.g. the search query) starts over.
 */
export function useProgressiveList(total: number, resetKey: unknown, initial = 60, step = 120) {
  const [count, setCount] = useState(initial);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Start again from the first page when the list itself changes.
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setCount(initial);
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || count >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setCount((value) => Math.min(total, value + step));
      },
      { rootMargin: "150% 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [count, step, total]);

  return { count: Math.min(count, total), sentinelRef, hasMore: count < total };
}
