// The desktop app's window with neither a folder nor a synced workspace: reopen a recent workspace
// (a folder or a synced one), open another folder of Markdown files, or sign in.
import { toPlatformError } from "@lydie/platform";
import type { FolderRef, RecentFolder } from "@lydie/platform";
import type { HostedWorkspaceSummary } from "@lydie/plugin-api/hosted";
import type { AccountWireState } from "@lydie/sync";
import { Button, CloseRegular, focusRing, Heading, TextField } from "@lydie/ui";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button as AriaButton } from "react-aria-components";

import { unwrap } from "./desktop.ts";
import type { NoWorkspaceError } from "./desktop.ts";
import { rememberWelcome } from "./welcome.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const MAX_RECENT = 8;

// "/Users/me/Notes" → "~/Notes" (macOS, Linux, Windows home folders).
function displayPath(path: string) {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=$|[/\\])/, "~");
}

export function DesktopStart({ start }: { start: NoWorkspaceError }) {
  const { client, platform, info } = start;
  const [state, setState] = useState<AccountWireState | null>(null);
  const [workspaces, setWorkspaces] = useState<HostedWorkspaceSummary[] | null>(null);
  const [folders, setFolders] = useState<RecentFolder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void client.request("state", null).then(setState);
    return client.subscribe("state", null, setState);
  }, [client]);

  useEffect(() => {
    platform.folders
      .recent()
      .then(setFolders)
      .catch(() => {});
  }, [platform]);

  const openFolder = async (folder: FolderRef) => {
    setError(null);
    try {
      await platform.windows.open({ scope: { kind: "local", folder } });
      platform.windows.close();
    } catch (e) {
      setError(`Could not open ${folder.name}: ${toPlatformError(e).detail}`);
    }
  };

  const forgetFolder = async (id: string) => {
    await platform.folders.forget(id);
    setFolders(await platform.folders.recent());
  };

  useEffect(() => {
    if (state?.status !== "signed-in") return;
    client
      .request("workspaces", null)
      .then((wire) => setWorkspaces(unwrap(wire)))
      .catch((e: unknown) => setError(message(e)));
  }, [client, state]);

  const open = async (workspaceId: string) => {
    await client.request("setScope", { scope: { kind: "hosted", workspaceId } });
    window.location.reload();
  };

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-canvas p-6"
      data-testid="desktop-start"
    >
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl bg-surface p-6 shadow-surface ring ring-gray-950/5">
        <Heading level={1} className="text-lg font-medium text-gray-900">
          Open your notes
        </Heading>
        {(folders.length > 0 || (workspaces?.length ?? 0) > 0) && (
          <ul
            aria-label="Workspaces"
            className="-mx-2 flex flex-col"
            data-testid="recent-workspaces"
          >
            {folders.slice(0, MAX_RECENT).map((folder) => (
              <WorkspaceRow
                key={folder.id}
                name={folder.name}
                detail={folder.path ? displayPath(folder.path) : "Folder"}
                onOpen={() =>
                  void openFolder({ id: folder.id, name: folder.name, path: folder.path })
                }
                onRemove={() => void forgetFolder(folder.id)}
              />
            ))}
            {state?.status === "signed-in" &&
              workspaces?.map((w) => (
                <WorkspaceRow
                  key={w.id}
                  name={w.name}
                  detail="Cloud"
                  onOpen={() => void open(w.id)}
                />
              ))}
          </ul>
        )}
        <Button
          variant="secondary"
          onPress={async () => {
            const folder = await platform.folders.pick({ title: "Open a folder of notes" });
            if (folder) await openFolder(folder);
          }}
        >
          Open folder…
        </Button>
        <div className="border-t border-gray-950/5" />
        {state === null ? null : state.status === "signed-in" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-600">Signed in as {state.user.email}</p>
            {workspaces?.length === 0 && <NewWorkspace start={start} onCreated={open} />}
            <Button variant="ghost" size="sm" onPress={() => void client.request("signOut", null)}>
              Sign out
            </Button>
          </div>
        ) : (
          <SignIn
            start={start}
            reason={
              info.wanted
                ? "Sign in to open your cloud workspace."
                : "Sign in to open a cloud workspace."
            }
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

type WorkspaceRowProps = {
  name: string;
  detail: string;
  onOpen: () => void;
  onRemove?: () => void;
};

function WorkspaceRow({ name, detail, onOpen, onRemove }: WorkspaceRowProps) {
  return (
    // The overlays are on the row so they cover the remove button too; pressed comes from the
    // open button only, as the remove button shows its own.
    <li className="group relative flex items-center rounded-lg hover:bg-gray-950/5 has-[>[data-pressed]:first-child]:bg-gray-950/8">
      <AriaButton
        onPress={onOpen}
        className={focusRing({
          className: `flex min-w-0 flex-1 flex-col items-start rounded-lg py-1.5 pl-2 text-left ${onRemove ? "pr-9" : "pr-2"}`,
        })}
      >
        <span className="w-full truncate text-sm font-medium text-gray-900">{name}</span>
        <span className="w-full truncate text-xs text-gray-500" title={detail}>
          {detail}
        </span>
      </AriaButton>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${name} from the list`}
          onPress={onRemove}
          className="absolute right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <CloseRegular className="size-3.5 icon-muted" />
        </Button>
      )}
    </li>
  );
}

function NewWorkspace({
  start,
  onCreated,
}: {
  start: NoWorkspaceError;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = unwrap(
        await start.client.request("createWorkspace", { name: name.trim(), gettingStarted: true }),
      );
      rememberWelcome(created.id);
      await onCreated(created.id);
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <TextField label="New cloud workspace" isRequired value={name} onChange={setName} />
      <Button type="submit" isDisabled={!name.trim()}>
        Create workspace
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

function SignIn({ start, reason }: { start: NoWorkspaceError; reason: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input = { email: email.trim(), password };
    // Not `try`: the React Compiler skips a component with a condition inside one.
    const failed = await start.client.request(mode === "sign-up" ? "signUp" : "signIn", input).then(
      (wire) => void unwrap(wire),
      (e: unknown) => ({ error: e }),
    );
    if (failed) setError(message(failed.error));
    // A window that was meant to open a workspace opens it now.
    else if (start.info.wanted) window.location.reload();
    setBusy(false);
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">{reason}</p>
      <TextField label="Email" type="email" isRequired value={email} onChange={setEmail} />
      <TextField
        label="Password"
        type="password"
        isRequired
        value={password}
        onChange={setPassword}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" isPending={busy}>
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
      >
        {mode === "sign-up" ? "I have an account" : "Create an account"}
      </Button>
    </form>
  );
}
