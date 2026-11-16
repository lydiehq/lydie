// `/oauth/consent?request=<id>`: an app asks to use the hosted MCP server for the signed-in person.
// Sign in (inline) first, then see who asks for what, pick the workspace, and approve or deny.
import type { HostedWorkspaceSummary } from "@lydie/plugin-api";
import {
  Button,
  ErrorState,
  Heading,
  LoadingState,
  Select,
  SelectItem,
  SpaceIcon,
} from "@lydie/ui";
import { useEffect, useState } from "react";

import { decide, describeScope, loadRequest, safeLogo } from "./oauth-consent.ts";
import type { ConsentRequest, LoadResult } from "./oauth-consent.ts";
import { api, AuthForm, session, useSessionState } from "./standalone.tsx";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function OAuthConsentPage() {
  const id = new URLSearchParams(window.location.search).get("request") ?? "";
  const state = useSessionState();
  const [restored, setRestored] = useState(false);
  const [load, setLoad] = useState<LoadResult | null>(null);
  const signedIn = state.status === "signed-in";

  useEffect(() => {
    void session.restore().finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!signedIn || !id) return;
    void loadRequest(api, id).then(setLoad);
  }, [signedIn, id]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div
        className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-surface ring ring-gray-950/5"
        data-testid="oauth-consent"
      >
        {!id ? (
          <ErrorState
            title="This link is incomplete"
            error={new Error("No request in the link.")}
          />
        ) : !restored ? (
          <LoadingState label="Loading" />
        ) : !signedIn ? (
          <div className="flex flex-col gap-4">
            <div>
              <Heading level={1} className="text-lg font-medium text-gray-900">
                Sign in to Lydie
              </Heading>
              <p className="mt-1 text-sm text-gray-600">
                An app wants to connect to your Lydie account. Sign in to continue.
              </p>
            </div>
            <AuthForm initialMode="sign-in" />
          </div>
        ) : !load ? (
          <LoadingState label="Loading the request" />
        ) : load.status === "gone" ? (
          <ErrorState
            title="This request has expired"
            error={new Error("Go back to the app and connect again.")}
          />
        ) : load.status === "error" ? (
          <ErrorState title="Could not load the request" error={new Error(load.message)} />
        ) : (
          <Consent request={load.request} email={state.user.email} />
        )}
      </div>
    </div>
  );
}

function Consent({ request: req, email }: { request: ConsentRequest; email: string }) {
  const [workspaces, setWorkspaces] = useState<HostedWorkspaceSummary[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logo = safeLogo(req.client.logoUri);

  useEffect(() => {
    session
      .workspaces()
      .then((list) => {
        setWorkspaces(list);
        setWorkspaceId(list[0]?.id ?? null);
      })
      .catch((e: unknown) => setError(message(e)));
  }, []);

  const send = async (approve: boolean) => {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const choice = { approve, ...(approve && workspaceId ? { workspaceId } : {}) };
    try {
      const to = await decide(api, req.id, choice);
      window.location.assign(to);
    } catch (e) {
      setError(message(e));
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {logo ? (
          <img src={logo} alt="" className="size-10 shrink-0 rounded-lg" />
        ) : (
          <SpaceIcon seed={req.client.name} size={40} />
        )}
        <div className="min-w-0">
          <Heading level={1} className="text-lg font-medium text-gray-900">
            {req.client.name} wants to use Lydie
          </Heading>
          <p className="text-xs text-gray-500">
            It will send you back to {req.client.redirectHost}
            {req.client.uri ? ` · ${req.client.uri}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-gray-700">As {email}, it will be able to:</p>
        <ul className="list-disc pl-5 text-sm text-gray-700" aria-label="Permissions">
          {req.scopes.map((scope) => (
            <li key={scope}>{describeScope(scope)}</li>
          ))}
        </ul>
      </div>
      {workspaces && workspaces.length > 0 && (
        <Select
          label="Workspace"
          selectedKey={workspaceId}
          onSelectionChange={(key) => setWorkspaceId(String(key))}
        >
          {workspaces.map((w) => (
            <SelectItem key={w.id} id={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </Select>
      )}
      {workspaces?.length === 0 && (
        <p className="text-sm text-gray-600">You have no cloud workspace to connect yet.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" isPending={busy === "deny"} onPress={() => void send(false)}>
          Deny
        </Button>
        <Button
          isPending={busy === "approve"}
          isDisabled={!workspaceId || busy !== null}
          onPress={() => void send(true)}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
