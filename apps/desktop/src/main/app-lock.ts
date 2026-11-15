// The app lock (LYD-383): a PIN or password, and Touch ID where the Mac has it, asked for when the
// app starts, after a set time without input, when the screen locks or the computer sleeps, and on
// "Lock now". It is a lock on the app, not encryption: the notes stay readable on disk, which is
// also why deleting `app-lock.json` (with the app closed) is how a forgotten PIN is reset.
// Electron-free; index.ts wires the system events and Touch ID.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";

import type { AppLockState } from "@lydie/platform";
import { z } from "zod";

const fileSchema = z.object({
  // scrypt of the PIN or password, both base64.
  hash: z.string().min(1),
  salt: z.string().min(1),
  idleMinutes: z.number().int().positive().nullable(),
  touchId: z.boolean(),
});

type Stored = z.infer<typeof fileSchema>;

export const IDLE_CHOICES = [1, 5, 15, 60] as const;
// After this many wrong tries in a row, each further try waits, doubling from 30 s up to 15 min.
const FREE_TRIES = 5;
const MAX_WAIT_MS = 15 * 60_000;
const KEY_LENGTH = 32;

export type AppLockOptions = {
  file: string;
  now?: () => number;
  // Touch ID (macOS): whether this Mac can prompt, and the prompt itself (rejects when cancelled).
  touchIdAvailable?: () => boolean;
  promptTouchId?: (reason: string) => Promise<void>;
};

export class AppLockError extends Error {}

function derive(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(secret.normalize("NFKC"), salt, KEY_LENGTH, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export function checkSecret(secret: string): void {
  if (secret.length < 4) throw new AppLockError("Use at least 4 characters");
  if (secret.length > 256) throw new AppLockError("Use at most 256 characters");
}

export class AppLock {
  private stored: Stored | null;
  private locked: boolean;
  private failures = 0;
  private retryAt: number | null = null;
  private readonly listeners = new Set<(state: AppLockState) => void>();
  private readonly now: () => number;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly options: AppLockOptions) {
    this.now = options.now ?? Date.now;
    let raw: unknown = null;
    try {
      raw = JSON.parse(readFileSync(options.file, "utf8"));
    } catch {
      // No lock set up (or the file was deleted to reset it).
    }
    const parsed = fileSchema.safeParse(raw);
    this.stored = parsed.success ? parsed.data : null;
    // Locked from the start: no window shows content before the PIN.
    this.locked = this.stored !== null;
  }

  state(): AppLockState {
    const available = this.options.touchIdAvailable?.() ?? false;
    return {
      enabled: this.stored !== null,
      locked: this.locked,
      idleMinutes: this.stored?.idleMinutes ?? null,
      touchId: { available, enabled: available && (this.stored?.touchId ?? false) },
      retryAt: this.retryAt !== null && this.retryAt > this.now() ? this.retryAt : null,
      file: this.options.file,
    };
  }

  onChange(listener: (state: AppLockState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setUp(input: {
    secret: string;
    idleMinutes: number | null;
    touchId: boolean;
  }): Promise<void> {
    if (this.stored) throw new AppLockError("The app lock is already on");
    checkSecret(input.secret);
    const salt = randomBytes(16);
    const hash = await derive(input.secret, salt);
    await this.save({
      hash: hash.toString("base64"),
      salt: salt.toString("base64"),
      idleMinutes: input.idleMinutes,
      touchId: input.touchId,
    });
  }

  // While unlocked: when it locks by itself, and whether Touch ID unlocks it.
  async update(input: { idleMinutes?: number | null; touchId?: boolean }): Promise<void> {
    const stored = this.requireUnlocked();
    await this.save({
      ...stored,
      ...(input.idleMinutes !== undefined ? { idleMinutes: input.idleMinutes } : {}),
      ...(input.touchId !== undefined ? { touchId: input.touchId } : {}),
    });
  }

  async changeSecret(input: { current: string; secret: string }): Promise<boolean> {
    const stored = this.requireUnlocked();
    checkSecret(input.secret);
    if (!(await this.matches(input.current))) return false;
    const salt = randomBytes(16);
    const hash = await derive(input.secret, salt);
    await this.save({ ...stored, hash: hash.toString("base64"), salt: salt.toString("base64") });
    return true;
  }

  async remove(current: string): Promise<boolean> {
    this.requireUnlocked();
    if (!(await this.matches(current))) return false;
    this.stored = null;
    this.locked = false;
    await this.persist(null);
    this.emit();
    return true;
  }

  lock(): void {
    if (!this.stored || this.locked) return;
    this.locked = true;
    this.emit();
  }

  // Locks when the computer has had no input for the chosen time (`idleSeconds` from the system).
  checkIdle(idleSeconds: number): void {
    const minutes = this.stored?.idleMinutes;
    if (minutes && idleSeconds >= minutes * 60) this.lock();
  }

  async unlock(secret: string): Promise<boolean> {
    if (!this.stored || !this.locked) return true;
    if (this.retryAt !== null && this.retryAt > this.now()) return false;
    if (!(await this.matches(secret))) {
      this.failures += 1;
      if (this.failures >= FREE_TRIES) {
        const wait = Math.min(30_000 * 2 ** (this.failures - FREE_TRIES), MAX_WAIT_MS);
        this.retryAt = this.now() + wait;
      }
      this.emit();
      return false;
    }
    this.open();
    return true;
  }

  async unlockWithTouchId(): Promise<boolean> {
    const state = this.state();
    if (!this.locked || !state.touchId.enabled || !this.options.promptTouchId) return false;
    try {
      await this.options.promptTouchId("unlock Lydie");
    } catch {
      return false;
    }
    this.open();
    return true;
  }

  private open() {
    this.locked = false;
    this.failures = 0;
    this.retryAt = null;
    this.emit();
  }

  private requireUnlocked(): Stored {
    if (!this.stored) throw new AppLockError("The app lock is off");
    if (this.locked) throw new AppLockError("Unlock Lydie first");
    return this.stored;
  }

  private async matches(secret: string): Promise<boolean> {
    if (!this.stored) return false;
    const expected = Buffer.from(this.stored.hash, "base64");
    const given = await derive(secret, Buffer.from(this.stored.salt, "base64"));
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private async save(stored: Stored) {
    this.stored = stored;
    await this.persist(stored);
    this.emit();
  }

  private persist(stored: Stored | null): Promise<void> {
    const file = this.options.file;
    this.writing = this.writing.then(async () => {
      if (!stored) {
        await rm(file, { force: true });
        return;
      }
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify(stored), { mode: 0o600 });
      await rename(temp, file);
    });
    return this.writing;
  }

  private emit() {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}
