import { useAccount, useApp, useHostedQuery } from "@lydie/plugin-api";
import type { Connection, ConnectorInfo, HostedApiError } from "@lydie/plugin-api";
import {
  Button,
  Dialog,
  EmptyState,
  Heading,
  Input,
  Modal,
  Radio,
  RadioGroup,
  SettingsCard,
  SettingsCardEmpty,
  SettingsCardHeader,
  SettingsDetailsList,
  SettingsDetailsPanel,
  SettingsListItem,
  SettingsSection,
  SettingsSections,
  TextField,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { fieldsOf, initialValues, toValue, validate } from "./schema-form.ts";
import type { FormValues, JsonSchema } from "./schema-form.ts";
import { SchemaForm } from "./SchemaForm.tsx";

export function errorText(error: unknown): string {
  const e = error as HostedApiError | null;
  if (e?.kind === "network") return "Lydie cannot reach the server. Try again when you are online.";
  if (e?.code === "forbidden") return "Only workspace admins can change connections.";
  return e instanceof Error ? e.message : String(error);
}

type AuthChoice = ConnectorInfo["auth"][number];

function ConnectDialog({
  connector,
  close,
  connected,
}: {
  connector: ConnectorInfo;
  close: () => void;
  connected: (connection: Connection, revealed: Record<string, string> | null) => void;
}) {
  const app = useApp();
  const api = app.services!.account!;
  const methods = connector.auth.filter((a) => a.available);
  const [method, setMethod] = useState<AuthChoice | null>(methods[0] ?? null);
  const [name, setName] = useState(connector.name);
  const credentialFields = fieldsOf(method?.fields as JsonSchema | null);
  const settingFields = fieldsOf(connector.settingsSchema as JsonSchema);
  const [credentials, setCredentials] = useState<FormValues>({});
  const [settings, setSettings] = useState<FormValues>(() => initialValues(settingFields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!method) return;
    const problems = {
      ...validate(credentialFields, credentials),
      ...validate(settingFields, settings),
    };
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setError(null);
    try {
      if (method.type === "oauth2") {
        const { authorizeUrl } = await api.call("connection.authorize", {
          workspaceId: app.workspace.workspaceId,
          connector: connector.id,
          name: name.trim() || connector.name,
          settings: toValue(settingFields, settings),
        });
        // The provider sends the browser back to /settings/connections.
        window.location.assign(authorizeUrl);
        return;
      }
      const result = await api.call("connection.create", {
        workspaceId: app.workspace.workspaceId,
        connector: connector.id,
        name: name.trim() || connector.name,
        authMethod: method.type,
        settings: toValue(settingFields, settings),
        ...(method.type === "token"
          ? { credentials: toValue(credentialFields, credentials) as Record<string, string> }
          : {}),
      });
      for (const warning of result.warnings) app.notify({ title: warning });
      connected(result.connection, result.revealed);
      close();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="md">
      <Dialog aria-label={`Connect ${connector.name}`} className="max-h-[85vh] overflow-y-auto p-5">
        {/* The schema check decides, not the browser's (which would block it and leave stale
            errors). */}
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            Connect {connector.name}
          </Heading>
          <p className="text-sm text-gray-600">{connector.description}</p>
          <TextField label="Name" value={name} onChange={setName} isRequired />
          {methods.length > 1 && (
            <RadioGroup
              label="Sign in with"
              value={method?.type ?? null}
              onChange={(type) => setMethod(methods.find((m) => m.type === type) ?? null)}
            >
              {methods.map((m) => (
                <Radio key={m.type} value={m.type}>
                  {m.label}
                </Radio>
              ))}
            </RadioGroup>
          )}
          {method?.type === "generated" && (
            <p className="text-xs text-gray-500">
              Lydie creates a signing secret for you. It is shown once, after connecting.
            </p>
          )}
          {credentialFields.length > 0 && (
            <SchemaForm
              idPrefix="credentials"
              fields={credentialFields}
              values={credentials}
              errors={errors}
              onChange={setCredentials}
            />
          )}
          {settingFields.length > 0 && (
            <>
              <h3 className="mt-2 text-xs font-medium text-gray-500">Settings</h3>
              <SchemaForm
                idPrefix="settings"
                fields={settingFields}
                values={settings}
                errors={errors}
                onChange={setSettings}
              />
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isPending={busy} isDisabled={!method}>
              {method?.type === "oauth2" ? `Continue to ${connector.name}` : "Connect"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}

function ConnectionDetails({
  connection,
  connector,
  close,
  reload,
}: {
  connection: Connection;
  connector: ConnectorInfo | undefined;
  close: () => void;
  reload: () => Promise<void>;
}) {
  const app = useApp();
  const api = app.services!.account!;
  const settingFields = fieldsOf(connector?.settingsSchema as JsonSchema | undefined);
  const [settings, setSettings] = useState<FormValues>(() =>
    initialValues(settingFields, connection.settings),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const save = async () => {
    const problems = validate(settingFields, settings);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy("save");
    try {
      const result = await api.call("connection.update", {
        id: connection.id,
        settings: toValue(settingFields, settings),
      });
      setMessage({ ok: true, text: result.warnings.join(" ") || "Saved" });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      const result = await api.call("connection.test", { id: connection.id });
      setMessage({
        ok: result.ok,
        text: result.ok
          ? `Connected${result.connection.account ? ` as ${result.connection.account}` : ""}`
          : (result.connection.lastError ?? "The connection does not work"),
      });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsDetailsPanel
      title={connection.name}
      description={connector?.name ?? connection.connector}
      onClose={close}
      footer={
        <>
          <Button size="sm" onPress={() => void test()} isPending={busy === "test"}>
            Test connection
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onPress={async () => {
              if (
                !(await app.confirm({
                  message: `Remove ${connection.name}?`,
                  detail: "Its publications stop; what was published stays where it is.",
                  confirmLabel: "Remove",
                  destructive: true,
                }))
              )
                return;
              try {
                await api.call("connection.delete", { id: connection.id, force: true });
                close();
                await reload();
              } catch (e) {
                setMessage({ ok: false, text: errorText(e) });
              }
            }}
          >
            Remove
          </Button>
        </>
      }
    >
      <SettingsDetailsList>
        <dt>Status</dt>
        <dd>{connection.status === "active" ? "Working" : "Not working"}</dd>
        <dt>Account</dt>
        <dd>{connection.account ?? "—"}</dd>
        <dt>Credentials</dt>
        <dd>{connection.credentialsHint ?? "—"}</dd>
        <dt>Last checked</dt>
        <dd>
          {connection.lastValidatedAt ? new Date(connection.lastValidatedAt).toLocaleString() : "—"}
        </dd>
      </SettingsDetailsList>
      {connection.lastError && (
        <p role="alert" className="text-xs text-red-600">
          {connection.lastError}
        </p>
      )}
      {settingFields.length > 0 && (
        <div className="flex flex-col gap-2">
          <SchemaForm
            idPrefix={`connection-${connection.id}`}
            fields={settingFields}
            values={settings}
            errors={errors}
            onChange={setSettings}
          />
          <Button
            size="sm"
            variant="secondary"
            className="self-end"
            onPress={() => void save()}
            isPending={busy === "save"}
          >
            Save settings
          </Button>
        </div>
      )}
      {message && (
        <output className={message.ok ? "text-xs text-green-700" : "text-xs text-red-600"}>
          {message.text}
        </output>
      )}
    </SettingsDetailsPanel>
  );
}

export function ConnectionsPage({
  path,
  navigate,
}: {
  path: string | null;
  navigate: (path: string | null) => void;
}) {
  const { api } = useAccount();
  if (!api || api.scope.kind !== "hosted") {
    return (
      <EmptyState
        title="Publishing needs a cloud workspace"
        description="Connections to GitHub, WordPress and webhooks belong to a workspace in Lydie Cloud."
      />
    );
  }
  return <Connections path={path} navigate={navigate} />;
}

function Connections({
  path,
  navigate,
}: {
  path: string | null;
  navigate: (path: string | null) => void;
}) {
  const app = useApp();
  const connectors = useHostedQuery("connector.list", {});
  const connections = useHostedQuery("connection.list", { workspaceId: app.workspace.workspaceId });
  const [connecting, setConnecting] = useState<ConnectorInfo | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; values: Record<string, string> } | null>(
    null,
  );
  const list = connections.data?.connections ?? [];
  const open = list.find((c) => c.id === path) ?? null;
  const byId = new Map((connectors.data?.connectors ?? []).map((c) => [c.id, c]));

  // Back from an OAuth provider: `/settings/connections?connection=…` or `?error=…`.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) app.notify({ title: "Could not connect", description: error, kind: "error" });
    else if (params.get("connection") || params.get("status") === "connected") {
      app.notify({ title: "Connected" });
    }
  }, [app]);

  return (
    <SettingsSections>
      {revealed && (
        <output className="flex flex-col gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-900">
          <p>{revealed.name} is connected. Copy the secret now: it is not shown again.</p>
          {Object.entries(revealed.values).map(([key, value]) => (
            <label key={key} className="flex flex-col gap-1 text-xs">
              {key}
              <Input
                readOnly
                value={value}
                aria-label={key}
                size="sm"
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
            </label>
          ))}
          <Button
            size="xs"
            variant="secondary"
            className="self-end"
            onPress={() => setRevealed(null)}
          >
            I have copied it
          </Button>
        </output>
      )}
      <SettingsSection title="Connected">
        <SettingsCard data-testid="connections">
          <SettingsCardHeader
            title={list.length === 1 ? "1 connection" : `${list.length} connections`}
          />
          {connections.isLoading && list.length === 0 && (
            <SettingsCardEmpty>Loading connections…</SettingsCardEmpty>
          )}
          {connections.error && list.length === 0 && (
            <SettingsCardEmpty role="alert">
              {errorText(connections.error)}
              <Button size="xs" variant="secondary" onPress={() => void connections.reload()}>
                Retry
              </Button>
            </SettingsCardEmpty>
          )}
          {!connections.isLoading && !connections.error && list.length === 0 && (
            <SettingsCardEmpty>Nothing connected yet. Pick a destination below.</SettingsCardEmpty>
          )}
          {list.map((c) => (
            <SettingsListItem
              key={c.id}
              title={c.name}
              meta={[
                byId.get(c.connector)?.name ?? c.connector,
                c.account,
                c.status === "error" ? "Not working" : null,
              ]}
              selected={open?.id === c.id}
              onPress={() => navigate(open?.id === c.id ? null : c.id)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Destinations" description="Where documents can be published.">
        <SettingsCard>
          {connectors.error && !connectors.data && (
            <SettingsCardEmpty role="alert">{errorText(connectors.error)}</SettingsCardEmpty>
          )}
          {(connectors.data?.connectors ?? []).map((c) => (
            <SettingsListItem
              key={c.id}
              title={c.name}
              meta={c.description}
              trailing={
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Connect ${c.name}`}
                  isDisabled={!c.auth.some((a) => a.available)}
                  onPress={() => setConnecting(c)}
                >
                  Connect
                </Button>
              }
            />
          ))}
        </SettingsCard>
      </SettingsSection>
      {open && (
        <ConnectionDetails
          key={open.id}
          connection={open}
          connector={byId.get(open.connector)}
          close={() => navigate(null)}
          reload={connections.reload}
        />
      )}
      {connecting && (
        <ConnectDialog
          connector={connecting}
          close={() => setConnecting(null)}
          connected={(connection, values) => {
            connections.setData((d) => d && { connections: [...d.connections, connection] });
            void connections.reload();
            if (values && Object.keys(values).length)
              setRevealed({ name: connection.name, values });
          }}
        />
      )}
    </SettingsSections>
  );
}
