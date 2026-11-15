export type BackoffOptions = {
  // First delay. Default 500 ms.
  baseMs?: number;
  // Upper bound. Default 30 s.
  maxMs?: number;
  // Full jitter (a random delay in [0, computed]) so many clients do not retry in lockstep.
  // Default true.
  jitter?: boolean;
};

// Delay before retry number `attempt` (0-based): base · 2^attempt, capped, with full jitter.
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 500;
  const max = options.maxMs ?? 30_000;
  const delay = Math.min(max, base * 2 ** Math.min(attempt, 30));
  return options.jitter === false ? delay : Math.round(delay / 2 + (Math.random() * delay) / 2);
}

export class AbortedError extends Error {
  override readonly name = "AbortedError";
  constructor() {
    super("Aborted");
  }
}

// Resolves after `ms`, or rejects with AbortedError when `signal` aborts first.
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Serialises async work: `run(fn)` waits for every earlier `run` to settle first.
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = tail.then(fn, fn);
      tail = next.catch(() => {});
      return next;
    },
  };
}
