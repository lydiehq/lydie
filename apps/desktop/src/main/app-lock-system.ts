import type { AppLockState } from "@lydie/platform";
// The app lock's ties to the system: Touch ID, and locking when the screen locks, the computer
// sleeps, or there has been no input for the chosen time.
import { powerMonitor, systemPreferences } from "electron";

import { AppLock } from "./app-lock.ts";

const IDLE_CHECK_MS = 15_000;

export function createAppLock(file: string, broadcast: (state: AppLockState) => void): AppLock {
  const mac = process.platform === "darwin";
  const lock = new AppLock({
    file,
    touchIdAvailable: () => mac && systemPreferences.canPromptTouchID(),
    promptTouchId: (reason) => systemPreferences.promptTouchID(reason),
  });
  lock.onChange(broadcast);
  powerMonitor.on("lock-screen", () => lock.lock());
  powerMonitor.on("suspend", () => lock.lock());
  setInterval(() => lock.checkIdle(powerMonitor.getSystemIdleTime()), IDLE_CHECK_MS).unref();
  return lock;
}
