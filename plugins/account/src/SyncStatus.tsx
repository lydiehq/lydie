import { useAccount, useApp, useObservable, useStatus } from "@lydie/plugin-api";
import type { RejectedChange, SyncDetails } from "@lydie/plugin-api";
import { Button, CloseRegular, Dialog, Popover } from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";

import { describeRejected, plural, relativeTime } from "./format.ts";
import { localEntry, toCloud, useSignUpMode } from "./sign-up.ts";

const LABELS: Record<SyncDetails["state"], string> = {
  "signed-out": "Signed out",
  "auth-expired": "Sign in again",
  offline: "Offline",
  connecting: "Connecting",
  syncing: "Syncing",
  synced: "Synced",
  error: "Sync problem",
};

// Re-renders every 30 s so "2 minutes ago" stays true.
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function RejectedList({
  rejected,
  onDismiss,
}: {
  rejected: readonly RejectedChange[];
  onDismiss: (ids?: readonly string[]) => void;
}) {
  if (rejected.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="rejected-changes">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">
          {plural(rejected.length, "change")} not saved
        </span>
        <Button size="xs" variant="ghost" onPress={() => onDismiss()}>
          Dismiss all
        </Button>
      </div>
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {rejected.map((r) => (
          <li key={r.operationId} className="flex items-start gap-2 text-xs text-gray-600">
            <span className="grow">{describeRejected(r)}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Dismiss"
              onPress={() => onDismiss([r.operationId])}
            >
              <CloseRegular aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400">These pages show what the server has.</p>
    </div>
  );
}

export function SyncDetailsBody({ details }: { details: SyncDetails }) {
  const app = useApp();
  const { api } = useAccount();
  const now = useNow();
  return (
    <div className="flex flex-col gap-3 p-3 text-sm" data-testid="sync-details">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{LABELS[details.state]}</span>
        <span className="text-xs text-gray-500">
          Last synced {relativeTime(details.lastSyncedAt, now)}
        </span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-xs text-gray-600">
        <dt>Changes waiting to upload</dt>
        <dd data-testid="pending-operations">{details.pendingOperations}</dd>
        <dt>Files waiting to upload</dt>
        <dd>{details.pendingUploads}</dd>
      </dl>
      {details.state === "offline" && (
        <p className="text-xs text-gray-600">
          You are offline. Changes are kept on this device and sync when you reconnect.
        </p>
      )}
      {details.error && details.state !== "offline" && (
        <p className="text-xs text-red-600">{details.error}</p>
      )}
      {details.retryAt && (
        <p className="text-xs text-gray-500">Trying again {relativeTime(details.retryAt, now)}.</p>
      )}
      <RejectedList
        rejected={details.rejected}
        onDismiss={(ids) => app.backend.status.dismissRejected?.(ids)}
      />
      <div className="flex justify-end gap-2">
        {(details.state === "auth-expired" || details.state === "signed-out") && (
          <Button size="xs" onPress={() => app.overlays.open("account.signIn")}>
            Sign in again
          </Button>
        )}
        {(details.state === "error" || details.state === "offline" || details.retryAt) && (
          <Button size="xs" variant="secondary" onPress={() => api?.sync?.retry()}>
            Retry now
          </Button>
        )}
      </div>
    </div>
  );
}

// The sidebar footer's account entry: in a local window "Join the cloud waitlist" (while accounts
// open gradually) or "Sign in to Lydie Cloud", the sync state (with its details) in a hosted one.
export function AccountStatusItem() {
  const app = useApp();
  const { api, state } = useAccount();
  const details = useObservable(api?.sync?.details);
  const status = useStatus();
  const signUp = useSignUpMode();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!api) return null;

  if (api.scope.kind === "local") {
    const entry = localEntry({
      signedOut: state.status === "signed-out",
      wanted: api.wanted !== null,
      signUp,
      toCloud: toCloud(api),
    });
    return (
      <Button
        variant="ghost"
        size="xs"
        onPress={() =>
          entry.opens === "account.handoff"
            ? app.overlays.open("account.handoff")
            : // Signing in decides where to go next (`after-sign-in.ts`).
              app.overlays.open(entry.opens, {})
        }
        className="text-gray-600"
      >
        {entry.label}
      </Button>
    );
  }

  if (!details) return null;
  const pending = details.pendingOperations + details.pendingUploads;
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="xs"
        aria-label={`Sync: ${LABELS[details.state]}${pending ? `, ${pending} waiting` : ""}`}
        data-testid="sync-status"
        data-state={details.state}
        onPress={() => setOpen(true)}
        className="gap-1.5 text-gray-600"
      >
        <span
          aria-hidden
          className={
            details.state === "synced"
              ? "size-1.5 rounded-full bg-green-500"
              : details.state === "offline" || details.state === "connecting"
                ? "size-1.5 rounded-full bg-gray-400"
                : details.state === "syncing"
                  ? "size-1.5 rounded-full bg-blue-500"
                  : "size-1.5 rounded-full bg-amber-500"
          }
        />
        {LABELS[details.state]}
        {(status.rejected?.length ?? 0) > 0 && (
          <span className="rounded bg-red-100 px-1 text-xs text-red-700">
            {status.rejected!.length}
          </span>
        )}
      </Button>
      <Popover
        triggerRef={trigger}
        isOpen={open}
        onOpenChange={setOpen}
        placement="top start"
        className="w-80"
      >
        <Dialog aria-label="Sync details">
          <SyncDetailsBody details={details} />
        </Dialog>
      </Popover>
    </>
  );
}
