// `/invite?token=…`: the link in an invitation email. Shows what the invitation is for, asks the
// person to sign in or create an account (with the invited address), accepts, and opens the
// workspace. Runs before any workspace is opened, so it never touches a local database.
import type { InvitationPreview } from "@lydie/plugin-api";
import { createScopePreference } from "@lydie/sync";
import type { SessionState } from "@lydie/sync";
import { Button, ErrorState, Heading, LoadingState, SpaceIcon } from "@lydie/ui";
import { useEffect, useState } from "react";

import { localKv, rememberWorkspaceNames, webBase } from "./hosted.ts";
import { api, AuthForm, session, useSessionState } from "./standalone.tsx";

const ROLE: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
  guest: "a guest",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function InvitePage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [restored, setRestored] = useState(false);
  const state = useSessionState();
  const signedIn = state.status === "signed-in";

  useEffect(() => {
    void session.restore().finally(() => setRestored(true));
  }, []);

  // The core shows an invitation only to a signed-in person.
  useEffect(() => {
    if (!signedIn) return;
    setError(null);
    api
      .call("invitation.lookup", { token })
      .then(setPreview)
      .catch((e: unknown) => setError(e));
  }, [token, signedIn]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div
        className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-surface ring ring-gray-950/5"
        data-testid="invite-page"
      >
        {!restored ? (
          <LoadingState label="Opening your invitation" />
        ) : !signedIn ? (
          <div className="flex flex-col gap-4">
            <div>
              <Heading level={1} className="text-lg font-medium text-gray-900">
                You are invited to Lydie
              </Heading>
              <p className="mt-1 text-sm text-gray-600">
                Create an account or sign in with the email address the invitation was sent to.
              </p>
            </div>
            <AuthForm />
          </div>
        ) : error ? (
          <ErrorState
            title="This invitation link does not work"
            error={
              (error as { status?: number }).status === 404
                ? new Error("It may have expired, been revoked, or replaced by a newer one.")
                : error
            }
            action={
              <Button variant="secondary" onPress={() => void session.signOut()}>
                Use another account
              </Button>
            }
          />
        ) : !preview ? (
          <LoadingState label="Opening your invitation" />
        ) : (
          <Invitation preview={preview} token={token} state={state} />
        )}
      </div>
    </div>
  );
}

function Invitation({
  preview,
  token,
  state,
}: {
  preview: InvitationPreview;
  token: string;
  state: SessionState;
}) {
  const invitation = preview.invitation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = state.status === "signed-in";
  const wrongAccount =
    signedIn && state.user.email.toLowerCase() !== invitation.email.toLowerCase();

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.call("invitation.accept", { token });
      rememberWorkspaceNames([{ id: result.workspaceId, name: preview.workspaceName }]);
      await createScopePreference(localKv).set({ kind: "hosted", workspaceId: result.workspaceId });
      window.location.assign(webBase());
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  if (invitation.status !== "pending") {
    return (
      <ErrorState
        title={`This invitation was ${invitation.status}`}
        error={new Error("Ask whoever invited you for a new one.")}
        action={<Button onPress={() => window.location.assign(webBase())}>Open Lydie</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SpaceIcon seed={preview.workspaceName} size={40} className="mb-3" />
        <Heading level={1} className="text-lg font-medium text-gray-900">
          Join {preview.workspaceName}
        </Heading>
        <p className="mt-1 text-sm text-gray-600">
          {preview.invitedByName ?? "Someone"} invited {invitation.email}
          {preview.documentTitle
            ? ` to the page “${preview.documentTitle}”.`
            : ` to join as ${ROLE[invitation.role] ?? invitation.role}.`}
        </p>
      </div>
      {signedIn && !wrongAccount ? (
        <div className="flex flex-col gap-2">
          <Button onPress={() => void accept()} isPending={busy}>
            Accept invitation
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={async () => {
              await api.call("invitation.decline", { token }).catch(() => {});
              window.location.assign(webBase());
            }}
          >
            Decline
          </Button>
        </div>
      ) : wrongAccount ? (
        <div className="flex flex-col gap-2 text-sm text-gray-600">
          <p>
            You are signed in as {state.status === "signed-in" ? state.user.email : ""}. This
            invitation is for {invitation.email}.
          </p>
          <Button variant="secondary" onPress={() => void session.signOut()}>
            Sign out
          </Button>
        </div>
      ) : null}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
