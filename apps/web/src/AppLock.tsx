// The app lock's screen (desktop, LYD-383). The gate waits for the lock's state before showing the
// app, so a locked app never paints notes (the workspace opens meanwhile: only showing it waits). When it locks later, the screen covers the window and
// everything else on the page is made inert, keys included, until it is unlocked.
import type { AppLock, AppLockState } from "@lydie/platform";
import { Button, LydieMark, TextField } from "@lydie/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

export function AppLockGate({ lock, children }: { lock: AppLock; children: ReactNode }) {
  const [state, setState] = useState<AppLockState | null>(null);
  // Whether the app has been shown in this page: it then stays mounted under the lock screen.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    const apply = (next: AppLockState) => {
      if (!live) return;
      setState(next);
      if (!next.locked) setShown(true);
    };
    void lock.state().then(apply);
    const stop = lock.onChange(apply);
    return () => {
      live = false;
      stop();
    };
  }, [lock]);
  if (!state) return null;
  return (
    <>
      {(shown || !state.locked) && children}
      {state.locked && <LockScreen lock={lock} state={state} />}
    </>
  );
}

function LockScreen({ lock, state }: { lock: AppLock; state: AppLockState }) {
  const container = useInertOthers();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const wait = useSecondsUntil(state.retryAt);
  const touchId = state.touchId.enabled;

  const withTouchId = async () => {
    setError(null);
    if (!(await lock.unlockWithTouchId())) setError("Touch ID did not unlock Lydie.");
  };
  // Asks for Touch ID once, in the window in front.
  const asked = useRef(false);
  useEffect(() => {
    if (!touchId || asked.current || !document.hasFocus()) return;
    asked.current = true;
    void lock.unlockWithTouchId();
  }, [lock, touchId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!secret) return;
    setBusy(true);
    setError(null);
    const unlocked = await lock.unlock(secret).catch(() => null);
    setBusy(false);
    if (unlocked === null) {
      setError("Lydie could not check that. Try again.");
    } else if (!unlocked) {
      setSecret("");
      setError("That is not it. Try again.");
    }
  };

  return createPortal(
    <dialog
      open
      aria-label="Lydie is locked"
      className="fixed inset-0 z-[2147483000] m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-canvas p-0 [-webkit-app-region:drag]"
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="flex w-72 flex-col items-center gap-4 [-webkit-app-region:no-drag]"
      >
        <LydieMark size={40} className="text-gray-900" />
        <h1 className="text-base font-medium text-gray-900">Lydie is locked</h1>
        {forgot ? (
          <div className="flex flex-col gap-3 text-sm text-gray-600">
            <p>
              Quit Lydie, delete this file, then open Lydie again. That removes the lock; your notes
              are not affected.
            </p>
            <code
              className="rounded bg-gray-950/5 px-2 py-1 text-xs break-all text-gray-800 select-all"
              data-testid="app-lock-file"
            >
              {state.file}
            </code>
            <Button variant="secondary" size="sm" onPress={() => setForgot(false)}>
              Back
            </Button>
          </div>
        ) : (
          <>
            <TextField
              aria-label="PIN or password"
              placeholder="PIN or password"
              type="password"
              value={secret}
              onChange={setSecret}
              autoComplete="off"
              isDisabled={wait > 0}
              className="w-full"
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the only thing to do here
              autoFocus
            />
            {(error || wait > 0) && (
              <p role="alert" className="text-center text-sm text-red-600">
                {wait > 0 ? `Too many tries. Try again in ${wait} s.` : error}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              className="w-full"
              isPending={busy}
              isDisabled={wait > 0}
            >
              Unlock
            </Button>
            {touchId && (
              <Button variant="secondary" size="sm" className="w-full" onPress={withTouchId}>
                Use Touch ID
              </Button>
            )}
            <Button variant="ghost" size="xs" onPress={() => setForgot(true)}>
              Forgot it?
            </Button>
          </>
        )}
      </form>
    </dialog>,
    container,
  );
}

// A container of its own at the end of <body>; every other child of <body> is inert while it is
// there (portaled dialogs included), and keys outside it go nowhere.
function useInertOthers(): HTMLElement {
  const [own] = useState(() => {
    const element = document.createElement("div");
    element.dataset.appLock = "";
    return element;
  });
  useLayoutEffect(() => {
    document.body.append(own);
    const made: Element[] = [];
    const quiet = () => {
      for (const child of document.body.children) {
        if (child === own || child.hasAttribute("inert")) continue;
        child.setAttribute("inert", "");
        made.push(child);
      }
    };
    quiet();
    // Dialogs and toasts that open while locked.
    const observer = new MutationObserver(quiet);
    observer.observe(document.body, { childList: true });
    const swallow = (event: KeyboardEvent) => {
      if (!own.contains(event.target as Node)) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", swallow, true);
    // Keys typed into the lock screen stop here too: the app's shortcuts listen on the window.
    const contain = (event: KeyboardEvent) => event.stopPropagation();
    own.addEventListener("keydown", contain);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", swallow, true);
      for (const element of made) element.removeAttribute("inert");
      own.remove();
    };
  }, [own]);
  return own;
}

function useSecondsUntil(at: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}
