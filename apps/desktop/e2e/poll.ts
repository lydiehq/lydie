import { setTimeout as sleep } from "node:timers/promises";

// Bun's expect has no `expect.poll`: re-read a value until it is accepted or the timeout passes,
// and return the last value so the caller's assertion reports what was actually there.
export async function poll<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeout = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (accept(value) || Date.now() > deadline) return value;
    await sleep(50);
  }
}
