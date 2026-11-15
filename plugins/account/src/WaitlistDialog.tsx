import { useAccount, useApp } from "@lydie/plugin-api";
import { Button, Dialog, Heading, Modal, TextField } from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { FormEvent } from "react";

import { waitlistMessage } from "./format.ts";
import type { SignInProps } from "./SignInDialog.tsx";

export type WaitlistProps = {
  email?: string;
  // Passed on to the sign-in dialog when the person has an account after all.
  then?: SignInProps["then"];
};

// Join the cloud waitlist from the app: an email address, sent to the server with source "app".
// The answer is the same for a new and a known address, so the dialog says the same thing too.
export function WaitlistDialog({ close, props }: { close: () => void; props: unknown }) {
  const app = useApp();
  const { api } = useAccount();
  const options = (props ?? {}) as WaitlistProps;
  const [email, setEmail] = useState(options.email ?? "");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!api) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.call("waitlist.join", { email: email.trim(), source: "app" });
      setJoined(email.trim());
    } catch (e) {
      setError(waitlistMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const signIn = () => {
    close();
    app.overlays.open("account.signIn", {
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(options.then ? { then: options.then } : {}),
    } satisfies SignInProps);
  };

  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label="Join the cloud waitlist" className="p-5">
        {joined ? (
          <div className="flex flex-col gap-3" data-testid="waitlist-joined">
            <Heading slot="title" className="text-base font-medium text-gray-900">
              You are on the list
            </Heading>
            <p className="text-sm text-gray-600">
              We sent a confirmation link to <span className="font-medium">{joined}</span>. Open it
              to confirm your address, and we will email you when your account is ready.
            </p>
            <p className="text-sm text-gray-600">
              Until then, keep writing: everything stays on this device.
            </p>
            <div className="mt-1 flex justify-end">
              <Button size="sm" onPress={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
            <Heading slot="title" className="text-base font-medium text-gray-900">
              Join the cloud waitlist
            </Heading>
            <p className="text-sm text-gray-600">
              Lydie Cloud keeps your notes on all your devices and lets you write with your team.
              Accounts are opening gradually. Leave your email and we will let you know when yours
              is ready.
            </p>
            <TextField
              label="Email"
              type="email"
              isRequired
              value={email}
              onChange={setEmail}
              autoComplete="email"
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's only field
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="mt-1 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onPress={signIn}>
                I have an account
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onPress={close}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isPending={busy}>
                  Join the waitlist
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </Modal>
  );
}
