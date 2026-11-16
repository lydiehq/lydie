import { useAccount, useApp } from "@lydie/plugin-api";
import { Button, Dialog, Heading, Modal, QrCode, TextField } from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { failureOf, twoFactorMessage } from "./format.ts";

export type TwoFactorAction = "enable" | "disable" | "backupCodes";

type Step =
  | { name: "password" }
  | { name: "scan"; uri: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] };

// The key an authenticator app takes when the QR code cannot be scanned, in groups of four.
export function setupKey(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

// Opened from the Account settings page, over it (not as an overlay, which would close Settings).
export function TwoFactorDialog({ action, close }: { action: TwoFactorAction; close: () => void }) {
  const app = useApp();
  const { api } = useAccount();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const twoFactor = api?.twoFactor;
  if (!twoFactor) return null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    const failed = await failureOf(work());
    if (failed) setError(twoFactorMessage(failed.error));
    setBusy(false);
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (action === "enable") {
        const setup = await twoFactor.enable(password);
        setStep({ name: "scan", ...setup });
      } else if (action === "disable") {
        await twoFactor.disable(password);
        close();
        app.notify({ title: "Two-step verification is off" });
      } else {
        setStep({ name: "codes", backupCodes: await twoFactor.backupCodes(password) });
      }
      setPassword("");
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (step.name !== "scan") return;
    void run(async () => {
      await twoFactor.confirm(code);
      setStep({ name: "codes", backupCodes: step.backupCodes });
    });
  };

  const title =
    action === "enable"
      ? "Turn on two-step verification"
      : action === "disable"
        ? "Turn off two-step verification"
        : "New backup codes";

  let body: ReactNode;
  if (step.name === "password") {
    body = (
      <form onSubmit={submitPassword} className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          {action === "enable"
            ? "When you sign in with your password, Lydie will also ask for a code from an authenticator app on your phone. Enter your password to start."
            : action === "disable"
              ? "Signing in with your password will no longer ask for a code. Enter your password to confirm."
              : "Your current backup codes will stop working. Enter your password to make new ones."}
        </p>
        <TextField
          label="Password"
          type="password"
          isRequired
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's only field
          autoFocus
        />
        <ErrorText message={error} />
        <Actions onCancel={close}>
          <Button
            type="submit"
            size="sm"
            isPending={busy}
            variant={action === "disable" ? "destructive" : "primary"}
          >
            {action === "disable" ? "Turn off" : "Continue"}
          </Button>
        </Actions>
      </form>
    );
  } else if (step.name === "scan") {
    body = (
      <form onSubmit={submitCode} className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          Scan this code with an authenticator app, such as 1Password, Google Authenticator or
          Authy. Then enter the six-digit code it shows.
        </p>
        <div className="flex items-center gap-4">
          <QrCode value={step.uri} size={144} label="QR code for your authenticator app" />
          <div className="min-w-0 text-xs text-gray-500">
            Cannot scan it? Enter this key in the app:
            <code
              className="mt-1 block rounded bg-gray-950/4 px-2 py-1 font-mono text-xs break-all text-gray-800 select-all"
              data-testid="two-factor-key"
            >
              {setupKey(step.uri)}
            </code>
          </div>
        </div>
        <TextField
          label="Code from the app"
          value={code}
          onChange={setCode}
          inputMode="numeric"
          autoComplete="one-time-code"
          isRequired
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- where the person types next
          autoFocus
        />
        <ErrorText message={error} />
        <Actions onCancel={close}>
          <Button type="submit" size="sm" isPending={busy} isDisabled={!code.trim()}>
            Turn on
          </Button>
        </Actions>
      </form>
    );
  } else {
    body = (
      <BackupCodes
        codes={step.backupCodes}
        intro={
          action === "enable"
            ? "Two-step verification is on. Keep these backup codes somewhere safe: each one signs you in once if you lose your phone."
            : "Keep these codes somewhere safe: each one signs you in once if you lose your phone. The old ones no longer work."
        }
        onDone={() => {
          close();
          if (action === "enable") app.notify({ title: "Two-step verification is on" });
        }}
      />
    );
  }

  return (
    // Not dismissable by clicking outside: closing it before the codes are saved loses them.
    <Modal isOpen onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label={title} className="flex flex-col gap-3 p-5">
        <Heading slot="title" className="text-base font-medium text-gray-900">
          {title}
        </Heading>
        {body}
      </Dialog>
    </Modal>
  );
}

function BackupCodes({
  codes,
  intro,
  onDone,
}: {
  codes: string[];
  intro: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">{intro}</p>
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-gray-950/3 px-4 py-3 font-mono text-sm text-gray-800 select-all"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-1 flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button size="sm" onPress={onDone}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {message}
    </p>
  );
}

function Actions({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  return (
    <div className="mt-1 flex justify-end gap-2">
      <Button variant="secondary" size="sm" onPress={onCancel}>
        Cancel
      </Button>
      {children}
    </div>
  );
}
