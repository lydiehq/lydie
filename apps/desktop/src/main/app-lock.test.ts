import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppLockState } from "@lydie/platform";

import { AppLock, type AppLockOptions } from "./app-lock.ts";

const dirs: string[] = [];

function fileIn(): string {
  const dir = mkdtempSync(join(tmpdir(), "lydie-lock-"));
  dirs.push(dir);
  return join(dir, "app-lock.json");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function lockWith(options: Partial<AppLockOptions> = {}) {
  const file = options.file ?? fileIn();
  const lock = new AppLock({ file, ...options });
  await lock.setUp({ secret: "2468", idleMinutes: 5, touchId: true });
  return { lock, file };
}

describe("AppLock", () => {
  it("is off until set up, and locked from the next start", async () => {
    const file = fileIn();
    const off = new AppLock({ file });
    expect(off.state()).toMatchObject({ enabled: false, locked: false });
    await off.setUp({ secret: "2468", idleMinutes: null, touchId: false });
    // Setting it up does not lock this run.
    expect(off.state()).toMatchObject({ enabled: true, locked: false });
    const stored = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    expect(JSON.stringify(stored)).not.toContain("2468");

    const next = new AppLock({ file });
    expect(next.state()).toMatchObject({ enabled: true, locked: true, idleMinutes: null });
    expect(await next.unlock("1357")).toBe(false);
    expect(await next.unlock("2468")).toBe(true);
    expect(next.state().locked).toBe(false);
  });

  it("refuses a short secret", async () => {
    const lock = new AppLock({ file: fileIn() });
    await expect(lock.setUp({ secret: "12", idleMinutes: null, touchId: false })).rejects.toThrow(
      "at least 4",
    );
  });

  it("locks on request and after the idle time, and tells listeners", async () => {
    const { lock } = await lockWith();
    const seen: AppLockState[] = [];
    lock.onChange((state) => seen.push(state));
    lock.checkIdle(4 * 60);
    expect(lock.state().locked).toBe(false);
    lock.checkIdle(5 * 60);
    expect(lock.state().locked).toBe(true);
    expect(seen.at(-1)?.locked).toBe(true);
    await lock.unlock("2468");
    lock.lock();
    expect(lock.state().locked).toBe(true);
  });

  it("waits longer after five wrong tries", async () => {
    let now = 1_000_000;
    const file = fileIn();
    await lockWith({ file });
    const lock = new AppLock({ file, now: () => now });
    for (let i = 0; i < 5; i++) expect(await lock.unlock("0000")).toBe(false);
    expect(lock.state().retryAt).toBe(now + 30_000);
    // Even the right one waits.
    expect(await lock.unlock("2468")).toBe(false);
    now += 30_000;
    expect(await lock.unlock("0000")).toBe(false);
    expect(lock.state().retryAt).toBe(now + 60_000);
    now += 60_000;
    expect(await lock.unlock("2468")).toBe(true);
    expect(lock.state().retryAt).toBeNull();
  });

  it("Touch ID unlocks only when available, chosen and confirmed", async () => {
    let answer: "ok" | "cancel" = "cancel";
    const file = fileIn();
    await lockWith({ file });
    const options = {
      file,
      touchIdAvailable: () => true,
      promptTouchId: async () => {
        if (answer === "cancel") throw new Error("cancelled");
      },
    };
    const lock = new AppLock(options);
    expect(lock.state().touchId).toEqual({ available: true, enabled: true });
    expect(await lock.unlockWithTouchId()).toBe(false);
    answer = "ok";
    expect(await lock.unlockWithTouchId()).toBe(true);
    await lock.update({ touchId: false });
    lock.lock();
    expect(await lock.unlockWithTouchId()).toBe(false);
    expect(new AppLock({ file }).state().touchId).toEqual({ available: false, enabled: false });
  });

  it("changing or removing needs the current secret", async () => {
    const { lock, file } = await lockWith();
    expect(await lock.changeSecret({ current: "0000", secret: "abcd" })).toBe(false);
    expect(await lock.changeSecret({ current: "2468", secret: "abcd" })).toBe(true);
    expect(await lock.remove("2468")).toBe(false);
    expect(await lock.remove("abcd")).toBe(true);
    expect(lock.state()).toMatchObject({ enabled: false, locked: false });
    expect(existsSync(file)).toBe(false);
  });

  it("changes nothing while locked", async () => {
    const file = fileIn();
    await lockWith({ file });
    const lock = new AppLock({ file });
    await expect(lock.update({ idleMinutes: 1 })).rejects.toThrow("Unlock");
    await expect(lock.remove("2468")).rejects.toThrow("Unlock");
  });
});
