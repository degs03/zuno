import { useEffect, useState } from "preact/hooks";

import { call } from "./api";

export type Loaded<T> = { data: T | null; loading: boolean; failed: boolean; reload: () => void };

/** One server call per screen, re-run when `key` changes, with retry. */
export function useCall<T>(method: string, args: unknown[], key: string): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ data: T | null; loading: boolean; failed: boolean }>({
    data: null,
    loading: true,
    failed: false,
  });
  useEffect(() => {
    let alive = true;
    setResult({ data: null, loading: true, failed: false });
    call<T>(method, ...args).then(
      (data) => alive && setResult({ data, loading: false, failed: false }),
      () => alive && setResult({ data: null, loading: false, failed: true }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { ...result, reload: () => setAttempt((n) => n + 1) };
}
