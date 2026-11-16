import { useApp } from "@lydie/plugin-api";
import { useAccount } from "@lydie/plugin-api/hosted";
import { Button, Dialog, Heading, Modal, TextField } from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { FormEvent } from "react";

import { continueAfterSignIn } from "./after-sign-in.ts";
import {
  authMessage,
  failureOf,
  providerMessage,
  TWO_FACTOR_REQUIRED,
  twoFactorMessage,
} from "./format.ts";

export type SignInProps = {
  mode?: "sign-in" | "sign-up";
  // "handoff": the caller wants this window's workspace in the cloud. Where the window goes once
  // signed in is decided in `after-sign-in.ts`.
  then?: "handoff" | null;
  email?: string;
  reason?: string;
  // A provider sign-in that came back with this error code.
  error?: string;
};

export function SignInDialog({ close, props }: { close: () => void; props: unknown }) {
  const app = useApp();
  const { api, state } = useAccount();
  const options = (props ?? {}) as SignInProps;
  const [mode, setMode] = useState(options.mode ?? "sign-in");
  const [email, setEmail] = useState(
    options.email ?? (state.status === "expired" ? state.user.email : ""),
  );
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Desktop: the browser is open on Google and the dialog waits for it.
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(
    options.error ? providerMessage(options.error) : null,
  );
  // The password was right and the account asks for a code too.
  const [secondFactor, setSecondFactor] = useState<"app" | "backup" | null>(null);
  const [code, setCode] = useState("");

  if (!api) return null;

  const signedIn = async (how: "sign-in" | "sign-up") => {
    close();
    // A hosted window opened without a session: now it can open what it was meant to.
    if (api.wanted) {
      await api.openScope(api.wanted);
      return;
    }
    await continueAfterSignIn(app, api, { then: options.then ?? null, how });
  };

  const google = async () => {
    setError(null);
    setWaiting(true);
    // The web app leaves the page here and finishes when it comes back.
    const failed = await failureOf(
      api.signInWith("google", { then: options.then ?? null }).then(() => signedIn("sign-in")),
    );
    if (failed) setError(providerMessage(failed.error));
    setWaiting(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const credentials = { email: email.trim(), password };
    const account =
      mode === "sign-up"
        ? api.signUp({ ...credentials, ...(name.trim() ? { name: name.trim() } : {}) })
        : api.signIn(credentials);
    const failed = await failureOf(account.then(() => signedIn(mode)));
    if ((failed?.error as { code?: string } | null)?.code === TWO_FACTOR_REQUIRED) {
      setPassword("");
      setSecondFactor("app");
    } else if (failed) {
      setError(authMessage(failed.error, mode));
    }
    setBusy(false);
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!secondFactor) return;
    setBusy(true);
    setError(null);
    const failed = await failureOf(
      api.verifySignIn({ code: code.trim(), method: secondFactor }).then(() => signedIn("sign-in")),
    );
    if (failed) {
      const failure = ((failed.error as { code?: string } | null)?.code ?? "").toUpperCase();
      // The pending sign-in is gone: start again from the password.
      if (/EXPIRED|TOO_MANY_ATTEMPTS|TWO_FACTOR_COOKIE/.test(failure)) {
        setSecondFactor(null);
        setCode("");
      }
      setError(twoFactorMessage(failed.error));
    }
    setBusy(false);
  };

  if (secondFactor) {
    const backup = secondFactor === "backup";
    return (
      <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
        <Dialog aria-label="Two-step verification" className="p-5">
          <form onSubmit={(event) => void verify(event)} className="flex flex-col gap-3">
            <Heading slot="title" className="text-base font-medium text-gray-900">
              Two-step verification
            </Heading>
            <p className="text-sm text-gray-600">
              {backup
                ? "Enter one of the backup codes you saved when you turned on two-step verification. Each code works once."
                : "Enter the six-digit code from your authenticator app."}
            </p>
            <TextField
              key={secondFactor}
              label={backup ? "Backup code" : "Code"}
              isRequired
              value={code}
              onChange={setCode}
              inputMode={backup ? "text" : "numeric"}
              autoComplete="one-time-code"
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's only field
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="mt-1 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setSecondFactor(backup ? "app" : "backup");
                  setCode("");
                  setError(null);
                }}
              >
                {backup ? "Use the app instead" : "Use a backup code"}
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onPress={close}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isPending={busy} isDisabled={!code.trim()}>
                  Verify
                </Button>
              </div>
            </div>
          </form>
        </Dialog>
      </Modal>
    );
  }

  const signUp = mode === "sign-up";
  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label={signUp ? "Create an account" : "Sign in"} className="p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            {signUp ? "Create an account" : "Sign in to Lydie Cloud"}
          </Heading>
          <p className="text-sm text-gray-600">
            {options.reason ??
              "Lydie Cloud keeps your notes on all your devices and lets you write with your team."}
          </p>
          {waiting ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-950/3 px-3 py-2.5 text-sm text-gray-700">
              <span>Continue in your browser…</span>
              <Button
                variant="ghost"
                size="xs"
                onPress={() => {
                  api.cancelSignInWith();
                  setWaiting(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full gap-2"
              onPress={() => void google()}
            >
              <GoogleLogo />
              Continue with Google
            </Button>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400" aria-hidden>
            <span className="h-px grow bg-gray-950/8" />
            or
            <span className="h-px grow bg-gray-950/8" />
          </div>
          {signUp && <TextField label="Name" value={name} onChange={setName} autoComplete="name" />}
          <TextField
            label="Email"
            type="email"
            isRequired
            value={email}
            onChange={setEmail}
            autoComplete="email"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's first field
            autoFocus
          />
          <TextField
            label="Password"
            type="password"
            isRequired
            minLength={signUp ? 8 : undefined}
            value={password}
            onChange={setPassword}
            autoComplete={signUp ? "new-password" : "current-password"}
            description={signUp ? "At least 8 characters." : undefined}
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setMode(signUp ? "sign-in" : "sign-up");
                setError(null);
              }}
            >
              {signUp ? "I have an account" : "Create an account"}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onPress={close}>
                Cancel
              </Button>
              <Button type="submit" size="sm" isPending={busy}>
                {signUp ? "Create account" : "Sign in"}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}

// Google's "G" mark (brand colours, unchanged in dark mode).
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4 shrink-0" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
