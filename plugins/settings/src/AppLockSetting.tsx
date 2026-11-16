// The app lock (desktop, LYD-383): turning it on, when it locks, Touch ID, changing the PIN and
// turning it off. The lock screen is the shell's (apps/web AppLock.tsx).
import type { AppLock, AppLockState } from "@lydie/plugin-api";
import {
  Button,
  Dialog,
  Heading,
  Modal,
  Select,
  SelectItem,
  SettingsRow,
  Switch,
  TextField,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const IDLE = [
  { id: "never", label: "Never", minutes: null },
  { id: "1", label: "After 1 minute", minutes: 1 },
  { id: "5", label: "After 5 minutes", minutes: 5 },
  { id: "15", label: "After 15 minutes", minutes: 15 },
  { id: "60", label: "After 1 hour", minutes: 60 },
] as const;

type IdleId = (typeof IDLE)[number]["id"];

const idleId = (minutes: number | null): IdleId =>
  IDLE.find((choice) => choice.minutes === minutes)?.id ?? "never";
const idleMinutes = (id: IdleId) => IDLE.find((choice) => choice.id === id)?.minutes ?? null;

function useLockState(lock: AppLock): AppLockState | null {
  const [state, setState] = useState<AppLockState | null>(null);
  useEffect(() => {
    let live = true;
    void lock.state().then((next) => live && setState(next));
    const stop = lock.onChange((next) => live && setState(next));
    return () => {
      live = false;
      stop();
    };
  }, [lock]);
  return state;
}

export function AppLockRows({ lock }: { lock: AppLock }) {
  const state = useLockState(lock);
  const [dialog, setDialog] = useState<"enable" | "change" | "disable" | null>(null);
  if (!state) return null;
  return (
    <>
      <SettingsRow
        label="App lock"
        description={
          state.enabled
            ? "Lydie asks for your PIN or password when it starts, when the screen locks and after the time below. It locks the app; your notes on disk are not encrypted."
            : "Ask for a PIN or password before Lydie shows your notes. It locks the app; your notes on disk are not encrypted."
        }
      >
        {state.enabled ? (
          <>
            <Button size="sm" variant="secondary" onPress={() => void lock.lock()}>
              Lock now
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setDialog("change")}>
              Change…
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setDialog("disable")}>
              Turn off…
            </Button>
          </>
        ) : (
          <Button size="sm" onPress={() => setDialog("enable")}>
            Turn on…
          </Button>
        )}
      </SettingsRow>
      {state.enabled && (
        <SettingsRow label="Lock when idle" description="With no input anywhere on the computer.">
          <Select
            aria-label="Lock when idle"
            size="sm"
            className="w-40"
            selectedKey={idleId(state.idleMinutes)}
            onSelectionChange={(key) =>
              void lock.update({ idleMinutes: idleMinutes(key as IdleId) })
            }
          >
            {IDLE.map((choice) => (
              <SelectItem key={choice.id} id={choice.id}>
                {choice.label}
              </SelectItem>
            ))}
          </Select>
        </SettingsRow>
      )}
      {state.enabled && state.touchId.available && (
        <SettingsRow label="Unlock with Touch ID">
          <Switch
            aria-label="Unlock with Touch ID"
            isSelected={state.touchId.enabled}
            onChange={(touchId) => void lock.update({ touchId })}
          />
        </SettingsRow>
      )}
      {dialog && (
        <AppLockDialog
          lock={lock}
          action={dialog}
          touchIdAvailable={state.touchId.available}
          close={() => setDialog(null)}
        />
      )}
    </>
  );
}

function AppLockDialog({
  lock,
  action,
  touchIdAvailable,
  close,
}: {
  lock: AppLock;
  action: "enable" | "change" | "disable";
  touchIdAvailable: boolean;
  close: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [secret, setSecret] = useState("");
  const [again, setAgain] = useState("");
  const [idle, setIdle] = useState<IdleId>("5");
  const [touchId, setTouchId] = useState(touchIdAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title =
    action === "enable"
      ? "Turn on the app lock"
      : action === "change"
        ? "Change the PIN or password"
        : "Turn off the app lock";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (action !== "disable" && secret !== again) {
      setError("The two entries do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    // A promise chain rather than try/finally, which the React Compiler cannot compile.
    const attempt = async () => {
      if (action === "enable") {
        await lock.setUp({ secret, idleMinutes: idleMinutes(idle), touchId });
      } else if (action === "change") {
        if (!(await lock.changeSecret({ current, secret }))) {
          setError("The current PIN or password is not right.");
          return;
        }
      } else if (!(await lock.remove(current))) {
        setError("That PIN or password is not right.");
        return;
      }
      close();
    };
    await attempt()
      .catch((e: unknown) => {
        // The main process's reason ("Use at least 4 characters"), after Electron's prefix.
        const message = e instanceof Error ? e.message : String(e);
        setError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label={title} className="p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            {title}
          </Heading>
          {action === "enable" && (
            <p className="text-sm text-gray-600">
              If you forget it, Lydie shows how to remove the lock: your notes are not affected.
            </p>
          )}
          {action !== "enable" && (
            <TextField
              label={action === "change" ? "Current PIN or password" : "PIN or password"}
              type="password"
              isRequired
              value={current}
              onChange={setCurrent}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's first field
              autoFocus
            />
          )}
          {action !== "disable" && (
            <>
              <TextField
                label={action === "change" ? "New PIN or password" : "PIN or password"}
                type="password"
                isRequired
                value={secret}
                onChange={setSecret}
                description="At least 4 characters."
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's first field
                autoFocus={action === "enable"}
              />
              <TextField
                label="Again"
                type="password"
                isRequired
                value={again}
                onChange={setAgain}
              />
            </>
          )}
          {action === "enable" && (
            <>
              <Select
                label="Lock when idle"
                selectedKey={idle}
                onSelectionChange={(key) => setIdle(key as IdleId)}
              >
                {IDLE.map((choice) => (
                  <SelectItem key={choice.id} id={choice.id}>
                    {choice.label}
                  </SelectItem>
                ))}
              </Select>
              {touchIdAvailable && (
                <Switch isSelected={touchId} onChange={setTouchId}>
                  Unlock with Touch ID
                </Switch>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isPending={busy}
              variant={action === "disable" ? "destructive" : "primary"}
            >
              {action === "enable" ? "Turn on" : action === "change" ? "Change" : "Turn off"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}
