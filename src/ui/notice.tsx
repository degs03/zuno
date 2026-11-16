import { useEffect, useState } from "react";

/**
 * App-wide status pill for things that happen away from any open menu: a sound profile switched
 * because headphones connected, an import finished, downloads hit their cap. Fire-and-forget from
 * anywhere (stores included); `GlobalNotice` is mounted once in `App`.
 */
const NOTICE_EVENT = "zuno-notice";
const DEFAULT_MS = 3200;

interface NoticeDetail {
  message: string;
  durationMs: number;
}

export function showNotice(message: string, durationMs = DEFAULT_MS): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NoticeDetail>(NOTICE_EVENT, { detail: { message, durationMs } }));
}

export function GlobalNotice() {
  const [notice, setNotice] = useState<{ message: string; key: number } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const onNotice = (event: Event) => {
      const { message, durationMs } = (event as CustomEvent<NoticeDetail>).detail;
      setNotice({ message, key: Date.now() });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), durationMs);
    };
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => {
      window.removeEventListener(NOTICE_EVENT, onNotice);
      window.clearTimeout(timer);
    };
  }, []);

  if (!notice) return null;
  return (
    <div
      key={notice.key}
      className="pointer-events-none fixed bottom-[var(--bottom-chrome)] left-1/2 z-[70] mb-3 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full bg-popover/95 px-4 py-2 text-center text-sm text-foreground shadow-2xl backdrop-blur"
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  );
}
