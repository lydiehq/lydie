// Tokens encrypted with Electron's safeStorage (Keychain on macOS, DPAPI on Windows, the Secret
// Service/KWallet on Linux) and stored as base64 in userData/secrets.json.
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { PlatformError } from "@lydie/platform";
import { safeStorage } from "electron";

// Answered without touching the keychain, so startup never triggers an OS prompt. Linux without
// a keyring falls back to a hard-coded key, which is not secure storage.
export function secureStorageExpected(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return safeStorage.getSelectedStorageBackend() !== "basic_text";
}

export class SecretStore {
  private values: Record<string, string>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    try {
      this.values = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    } catch {
      this.values = {};
    }
  }

  private async check() {
    if (!secureStorageExpected() || !(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new PlatformError("unavailable", "No OS keychain is available for secure storage");
    }
  }

  async get(key: string): Promise<string | null> {
    await this.check();
    const value = this.values[key];
    if (value === undefined) return null;
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
        Buffer.from(value, "base64"),
      );
      if (shouldReEncrypt) await this.set(key, result);
      return result;
    } catch {
      // Encrypted with a key the OS no longer has (e.g. keychain reset).
      return null;
    }
  }

  async set(key: string, value: string) {
    await this.check();
    this.values[key] = (await safeStorage.encryptStringAsync(value)).toString("base64");
    await this.persist();
  }

  async delete(key: string) {
    delete this.values[key];
    await this.persist();
  }

  private persist() {
    const data = JSON.stringify(this.values);
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, data, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
    });
    return this.writing;
  }
}
