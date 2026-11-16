import { useAccount, useApp, useHostedQuery, useObservable } from "@lydie/plugin-api";
import type { AccountApi, VaultApi } from "@lydie/plugin-api";
import {
  Button,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  SettingsCard,
  SettingsCardBlock,
  SettingsCardEmpty,
  SettingsListItem,
  SettingsRow,
  SettingsSection,
  SettingsSections,
  Switch,
  TextField,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { mcpSnippets, TOKEN_PLACEHOLDER } from "../mcp-snippets.ts";

function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="max-w-72 truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
        {value}
      </code>
      <Button
        size="xs"
        variant="ghost"
        aria-label={`Copy ${label}`}
        onPress={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}

// Folder windows only (desktop): the server is the vault's.
function LocalMcp({ mcp }: { mcp: NonNullable<VaultApi["mcp"]> }) {
  const status = useObservable(mcp.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsCard>
      <SettingsRow
        label="Local MCP server"
        description="Lets agents on this computer (Claude, Cursor, …) read and edit this folder's notes. Off by default."
      >
        <Switch
          aria-label="Local MCP server"
          isSelected={status?.running ?? false}
          isDisabled={busy}
          onChange={async (enabled) => {
            setBusy(true);
            setError(null);
            // A promise chain rather than try/finally, which the React Compiler cannot compile.
            const attempt = async () => mcp.setEnabled(enabled);
            await attempt()
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setBusy(false));
          }}
        />
      </SettingsRow>
      {status?.running && status.url && (
        <SettingsRow label="URL" description="Streamable HTTP; send the token as a bearer token.">
          <Copyable value={status.url} label="MCP URL" />
        </SettingsRow>
      )}
      {status?.tokenPath && (
        <SettingsRow label="Token file" description="Keep it private: it grants full access.">
          <Copyable value={status.tokenPath} label="token path" />
        </SettingsRow>
      )}
      {(error ?? status?.error) && status?.error !== "Not available" && (
        <SettingsCardEmpty role="alert" className="text-red-600">
          {error ?? status?.error}
        </SettingsCardEmpty>
      )}
    </SettingsCard>
  );
}

const EXPIRY = { never: null, d30: 30, d90: 90, d365: 365 } as const;

// What a token may do. "inbox": only add to the inbox (inbox.capture), for a web clipper or an
// automation: it cannot read or change anything else.
const ACCESS = {
  write: { scopes: ["docs:read", "docs:write"], label: "Read and write" },
  read: { scopes: ["docs:read"], label: "Read only" },
  inbox: { scopes: ["inbox:write"], label: "Add to the inbox only" },
} as const;

function accessLabel(scopes: readonly string[]): string {
  if (scopes.includes("docs:write")) return ACCESS.write.label;
  if (scopes.includes("docs:read")) return ACCESS.read.label;
  return ACCESS.inbox.label;
}

// Personal API tokens for the open hosted workspace: the secret is shown once, at creation.
function ApiTokens({ onSecret }: { onSecret: (secret: string) => void }) {
  const app = useApp();
  const api = app.services!.account!;
  const workspaceId = app.workspace.workspaceId;
  const tokens = useHostedQuery("apiToken.list", { workspaceId });
  const [name, setName] = useState("");
  const [access, setAccess] = useState<keyof typeof ACCESS>("write");
  const [expiry, setExpiry] = useState<keyof typeof EXPIRY>("d90");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError(null);
    // A promise chain rather than try/finally, which the React Compiler cannot compile.
    const attempt = async () => {
      const days = EXPIRY[expiry];
      const result = await api.call("apiToken.create", {
        workspaceId,
        name: name.trim(),
        scopes: [...ACCESS[access].scopes],
        ...(days ? { expiresInDays: days } : {}),
      });
      setSecret(result.secret);
      onSecret(result.secret);
      setName("");
      await tokens.reload();
    };
    await attempt()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const list = tokens.data?.tokens ?? [];
  return (
    <>
      {secret && (
        <SettingsCardBlock>
          <output className="flex flex-col gap-2 text-xs text-green-900">
            Copy the token now: it is not shown again.
            <Copyable value={secret} label="API token" />
            <Button
              size="xs"
              variant="ghost"
              className="self-start"
              onPress={() => setSecret(null)}
            >
              I have copied it
            </Button>
          </output>
        </SettingsCardBlock>
      )}
      {list.map((t) => (
        <SettingsListItem
          key={t.id}
          title={t.name}
          meta={[
            `${t.prefix}…`,
            accessLabel(t.scopes),
            t.lastUsedAt ? `Used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "Never used",
            t.expiresAt ? `Expires ${new Date(t.expiresAt).toLocaleDateString()}` : "No expiry",
          ]}
          trailing={
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Revoke ${t.name}`}
              onPress={async () => {
                if (
                  !(await app.confirm({
                    message: `Revoke ${t.name}?`,
                    detail: "Anything using it stops working.",
                    confirmLabel: "Revoke",
                    destructive: true,
                  }))
                )
                  return;
                tokens.setData((d) => d && { tokens: d.tokens.filter((x) => x.id !== t.id) });
                await api.call("apiToken.revoke", { tokenId: t.id }).catch(() => tokens.reload());
              }}
            >
              Revoke
            </Button>
          }
        />
      ))}
      <SettingsCardBlock className="flex flex-wrap items-end gap-2">
        <TextField
          label="New token"
          placeholder="What it is for"
          value={name}
          onChange={setName}
          size="sm"
          className="grow"
        />
        <Select
          aria-label="Expires"
          size="sm"
          className="w-32"
          selectedKey={expiry}
          onSelectionChange={(key) => setExpiry(key as keyof typeof EXPIRY)}
        >
          <SelectItem id="d30">30 days</SelectItem>
          <SelectItem id="d90">90 days</SelectItem>
          <SelectItem id="d365">1 year</SelectItem>
          <SelectItem id="never">No expiry</SelectItem>
        </Select>
        <Select
          aria-label="Access"
          size="sm"
          className="w-48"
          selectedKey={access}
          onSelectionChange={(key) => setAccess(key as keyof typeof ACCESS)}
        >
          <SelectItem id="write">{ACCESS.write.label}</SelectItem>
          <SelectItem id="read">{ACCESS.read.label}</SelectItem>
          <SelectItem id="inbox">{ACCESS.inbox.label}</SelectItem>
        </Select>
        <Button size="sm" isDisabled={!name.trim()} isPending={busy} onPress={() => void create()}>
          Create token
        </Button>
        {error && (
          <p role="alert" className="w-full text-xs text-red-600">
            {error}
          </p>
        )}
      </SettingsCardBlock>
    </>
  );
}

// Whether the server offers OAuth: an unknown request is "not found", a missing route is
// "No such route".
async function offersOAuth(api: AccountApi): Promise<boolean> {
  try {
    await api.call("oauth.getRequest", { id: "0000000000000000-probe" });
    return true;
  } catch (error) {
    return !/no such route/i.test((error as Error).message ?? "");
  }
}

function HostedMcp({ token }: { token: string | null }) {
  const { api } = useAccount();
  const [oauth, setOauth] = useState<boolean | null>(null);
  const [auth, setAuth] = useState<"token" | "oauth">("token");
  const [client, setClient] = useState("claude-code");
  useEffect(() => {
    if (!api) return;
    void offersOAuth(api).then((available) => {
      setOauth(available);
      if (available) setAuth("oauth");
    });
  }, [api]);
  if (!api) return null;
  const url = `${api.apiUrl}/mcp`;
  const snippets = mcpSnippets(
    url,
    auth === "oauth" ? { kind: "oauth" } : { kind: "token", token: token ?? TOKEN_PLACEHOLDER },
  );
  const snippet = snippets.find((s) => s.id === client) ?? snippets[0]!;
  return (
    <>
      <SettingsRow label="MCP server" description="Streamable HTTP, for agents anywhere.">
        <Copyable value={url} label="MCP URL" />
      </SettingsRow>
      <SettingsCardBlock className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="App"
            className="w-44"
            selectedKey={snippet.id}
            onSelectionChange={(key) => setClient(String(key))}
          >
            {snippets.map((s) => (
              <SelectItem key={s.id} id={s.id}>
                {s.client}
              </SelectItem>
            ))}
          </Select>
          <RadioGroup
            aria-label="How the app signs in"
            orientation="horizontal"
            value={auth}
            onChange={(value) => setAuth(value as "token" | "oauth")}
          >
            <Radio value="token">API token</Radio>
            <Radio value="oauth" isDisabled={!oauth}>
              Sign in (OAuth)
            </Radio>
          </RadioGroup>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{snippet.where}</span>
          <CopyButton value={snippet.text} label={`${snippet.client} configuration`} />
        </div>
        <pre
          data-testid="mcp-snippet"
          className="overflow-x-auto rounded-md bg-gray-50 p-3 font-mono text-xs whitespace-pre text-gray-800"
        >
          {snippet.text}
        </pre>
        <p className="text-xs text-gray-500">
          {auth === "oauth"
            ? "The app opens Lydie to sign in and asks which workspace to use."
            : token
              ? "This uses the token you just created."
              : "Create a token below and it is filled in here."}
          {oauth === false && " Signing in with OAuth is not offered by this server yet."}
        </p>
      </SettingsCardBlock>
    </>
  );
}

// Apps the user connected with OAuth, for this workspace.
function ConnectedApps() {
  const app = useApp();
  const api = app.services!.account!;
  const grants = useHostedQuery("oauthGrant.list", { workspaceId: app.workspace.workspaceId });
  const [error, setError] = useState<string | null>(null);
  if (grants.error) {
    return (
      <SettingsCardEmpty role="alert">
        {/no such route/i.test(grants.error.message)
          ? "This server does not offer OAuth connections yet."
          : grants.error.message}
      </SettingsCardEmpty>
    );
  }
  if (!grants.data) return <SettingsCardEmpty>Loading connected apps…</SettingsCardEmpty>;
  if (grants.data.grants.length === 0) {
    return <SettingsCardEmpty>No apps connected.</SettingsCardEmpty>;
  }
  return (
    <div data-testid="connected-apps">
      {error && (
        <SettingsCardBlock>
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        </SettingsCardBlock>
      )}
      {grants.data.grants.map((g) => (
        <SettingsListItem
          key={g.id}
          title={g.client.name}
          meta={[
            accessLabel(g.scopes),
            `Connected ${new Date(g.createdAt).toLocaleDateString()}`,
            g.lastUsedAt ? `Used ${new Date(g.lastUsedAt).toLocaleDateString()}` : "Never used",
          ]}
          trailing={
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Disconnect ${g.client.name}`}
              onPress={async () => {
                const yes = await app.confirm({
                  message: `Disconnect ${g.client.name}?`,
                  detail: "It can no longer read or change your pages.",
                  confirmLabel: "Disconnect",
                  destructive: true,
                });
                if (!yes) return;
                setError(null);
                try {
                  await api.call("oauthGrant.revoke", { grantId: g.id });
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
                await grants.reload();
              }}
            >
              Disconnect
            </Button>
          }
        />
      ))}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label={`Copy ${label}`}
      onPress={() =>
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function AgentsPage() {
  const app = useApp();
  const { api, state } = useAccount();
  const [token, setToken] = useState<string | null>(null);
  const hosted = api?.scope.kind === "hosted" && state.status !== "signed-out";
  const localMcp = app.services?.vault?.mcp ?? null;
  return (
    <SettingsSections>
      {localMcp && (
        <SettingsSection title="On this computer">
          <LocalMcp mcp={localMcp} />
        </SettingsSection>
      )}
      <SettingsSection
        title="Hosted MCP"
        description="Connect Claude, Cursor or another agent to this cloud workspace."
      >
        <SettingsCard>
          {hosted ? (
            <HostedMcp token={token} />
          ) : (
            <SettingsCardEmpty>
              {api && state.status !== "signed-out"
                ? "Open a cloud workspace to connect agents to it."
                : "Sign in and open a cloud workspace to connect agents to it."}
            </SettingsCardEmpty>
          )}
        </SettingsCard>
      </SettingsSection>
      {hosted && (
        <SettingsSection title="Connected apps" description="Apps you allowed with OAuth.">
          <SettingsCard>
            <ConnectedApps />
          </SettingsCard>
        </SettingsSection>
      )}
      <SettingsSection
        title="Hosted API"
        description="Every action in Lydie is also a REST operation and an MCP tool."
      >
        <SettingsCard>
          {api && state.status !== "signed-out" ? (
            <>
              <SettingsRow label="API" description="OpenAPI document of every operation.">
                <Copyable value={`${api.apiUrl}/v1/openapi.json`} label="OpenAPI URL" />
              </SettingsRow>
              {api.scope.kind === "hosted" ? (
                <ApiTokens onSecret={setToken} />
              ) : (
                <SettingsCardEmpty>
                  Open a cloud workspace to create API tokens for it.
                </SettingsCardEmpty>
              )}
            </>
          ) : (
            <SettingsCardEmpty>Sign in to use the hosted API.</SettingsCardEmpty>
          )}
        </SettingsCard>
      </SettingsSection>
    </SettingsSections>
  );
}
