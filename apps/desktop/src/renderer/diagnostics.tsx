import { getInjectedPlatform, serviceClient, toPlatformError } from "@lydie/platform";
import type { FileEntry, RecentFolder, UpdateState, WindowState } from "@lydie/platform";
import { PlatformProvider, usePlatform } from "@lydie/platform/react";
// Dev-only page that calls every `Platform` method, for manual checks and the e2e smoke test.
// It talks to the platform only through `usePlatform()`, exactly as the real app will.
import { StrictMode, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { diagnosticsService } from "../shared/diagnostics-service.ts";

function useAction() {
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  async function run(action: () => unknown) {
    setError("");
    try {
      const value = await action();
      setResult(typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "done"));
    } catch (caught) {
      const platformError = toPlatformError(caught);
      setError(`${platformError.code}: ${platformError.detail}`);
    }
  }
  return { result, error, run };
}

type SectionProps = { title: string; testId: string; children: ReactNode };

function Section({ title, testId, children }: SectionProps) {
  return (
    <section data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Output({ action, testId }: { action: ReturnType<typeof useAction>; testId: string }) {
  return (
    <>
      {action.error && (
        <pre className="error" data-testid={`${testId}-error`}>
          {action.error}
        </pre>
      )}
      {action.result && <pre data-testid={testId}>{action.result}</pre>}
    </>
  );
}

function TitleBar() {
  const platform = usePlatform();
  const [state, setState] = useState<WindowState>(platform.windows.state());
  useEffect(() => platform.windows.onStateChange(setState), [platform]);
  const bar = state.titleBar;
  return (
    <header
      className="titlebar"
      style={{ height: bar.height || 36, paddingLeft: bar.insetLeft + 12, paddingRight: 12 }}
    >
      Platform diagnostics ·{" "}
      {platform.scope.kind === "local" ? platform.scope.folder.name : platform.scope.kind}
    </header>
  );
}

function InfoSection() {
  const platform = usePlatform();
  return (
    <Section title="App and capabilities" testId="info">
      <pre data-testid="scope">{JSON.stringify(platform.scope, null, 2)}</pre>
      <pre>
        {JSON.stringify({ app: platform.app, capabilities: platform.capabilities }, null, 2)}
      </pre>
    </Section>
  );
}

function FolderSection() {
  const platform = usePlatform();
  const action = useAction();
  const [recent, setRecent] = useState<RecentFolder[]>([]);
  const refresh = () => void platform.folders.recent().then(setRecent);
  useEffect(refresh, [platform]);
  return (
    <Section title="Folders" testId="folders">
      <button
        onClick={() =>
          action.run(async () => {
            const folder = await platform.folders.pick({ title: "Open a workspace folder" });
            if (folder)
              await platform.windows.open({ scope: { kind: "local", folder }, replace: true });
            return folder;
          })
        }
      >
        Pick folder…
      </button>
      <button onClick={refresh}>Refresh recent</button>
      <ul>
        {recent.map((folder) => (
          <li key={folder.id}>
            {folder.name}{" "}
            <button
              onClick={() =>
                action.run(() => platform.windows.open({ scope: { kind: "local", folder } }))
              }
            >
              open
            </button>
            <button
              onClick={() => action.run(() => platform.folders.forget(folder.id).then(refresh))}
            >
              forget
            </button>
          </li>
        ))}
      </ul>
      <Output action={action} testId="folders-output" />
    </Section>
  );
}

function FilesSection() {
  const platform = usePlatform();
  const files = platform.files;
  const action = useAction();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [path, setPath] = useState("hello.md");
  const [content, setContent] = useState("# Hello from the renderer\n");
  if (!files) {
    return (
      <Section title="Workspace files" testId="files">
        No local folder in this window.
      </Section>
    );
  }
  return (
    <Section title={`Workspace files: ${files.folder.path ?? files.folder.name}`} testId="files">
      <button
        data-testid="list-files"
        onClick={() =>
          action.run(async () => {
            const list = await files.list("", { recursive: true });
            setEntries(list);
            return `${list.length} entries`;
          })
        }
      >
        List
      </button>
      <ul data-testid="file-list">
        {entries.slice(0, 200).map((entry) => (
          <li key={entry.path}>
            <button onClick={() => setPath(entry.path)}>
              {entry.kind === "directory" ? "📁" : "📄"}
            </button>
            {entry.path} ({entry.size} B)
          </li>
        ))}
      </ul>
      <input data-testid="file-path" value={path} onChange={(e) => setPath(e.target.value)} />
      <textarea
        data-testid="file-content"
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        data-testid="read-file"
        onClick={() => action.run(async () => setContent(await files.readText(path)))}
      >
        Read
      </button>
      <button
        data-testid="write-file"
        onClick={() => action.run(() => files.writeText(path, content))}
      >
        Write
      </button>
      <button onClick={() => action.run(() => files.stat(path))}>Stat</button>
      <button onClick={() => action.run(() => files.mkdir(path))}>Mkdir</button>
      <button onClick={() => action.run(() => files.rename(path, `${path}.renamed`))}>
        Rename
      </button>
      <button
        onClick={() => action.run(() => files.delete(path, { recursive: true, toTrash: true }))}
      >
        Trash
      </button>
      <button onClick={() => action.run(() => files.readText("../outside.txt"))}>
        Try ../ escape
      </button>
      <Output action={action} testId="file-status" />
    </Section>
  );
}

function WatchSection() {
  const platform = usePlatform();
  const [log, setLog] = useState<string[]>([]);
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    if (!watching || !platform.files) return;
    return platform.files.watch((changes) =>
      setLog((previous) =>
        [
          ...changes.map((c) => (c.type === "rescan" ? "rescan" : `${c.type} ${c.path}`)),
          ...previous,
        ].slice(0, 200),
      ),
    );
  }, [platform, watching]);
  if (!platform.files) return null;
  return (
    <Section title="Watcher" testId="watcher">
      <button data-testid="watch-toggle" onClick={() => setWatching(!watching)}>
        {watching ? "Stop watching" : "Start watching"}
      </button>
      <span data-testid="watch-status">{watching ? "watching" : "stopped"}</span>
      <pre data-testid="watch-log">{log.join("\n")}</pre>
    </Section>
  );
}

function WindowSection() {
  const platform = usePlatform();
  const [state, setState] = useState(platform.windows.state());
  const [title, setTitle] = useState("Lydie diagnostics");
  useEffect(() => platform.windows.onStateChange(setState), [platform]);
  const action = useAction();
  return (
    <Section title={`Window ${platform.windows.id.slice(0, 8)}`} testId="window">
      <button onClick={() => platform.windows.minimize()}>Minimize</button>
      <button onClick={() => platform.windows.toggleMaximize()}>Maximize</button>
      <button onClick={() => platform.windows.toggleFullscreen()}>Full screen</button>
      <button onClick={() => platform.windows.close()}>Close</button>
      <button onClick={() => action.run(() => platform.windows.open({ scope: { kind: "none" } }))}>
        New window
      </button>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <button onClick={() => platform.windows.setTitle(title)}>Set title</button>
      <pre data-testid="window-state">{JSON.stringify(state, null, 2)}</pre>
      <Output action={action} testId="window-output" />
    </Section>
  );
}

function MenuSection() {
  const platform = usePlatform();
  const [lastAction, setLastAction] = useState("");
  const action = useAction();
  useEffect(() => platform.menus.onAction(setLastAction), [platform]);
  return (
    <Section title="Menus" testId="menus">
      <button
        onClick={() =>
          platform.menus.setApplicationMenu([
            { role: "appMenu" },
            {
              label: "Diagnostics",
              submenu: [
                { id: "diag.hello", label: "Say hello", accelerator: "CmdOrCtrl+Shift+H" },
                { type: "separator" },
                { id: "diag.checked", label: "A checkbox", type: "checkbox", checked: true },
              ],
            },
            { role: "editMenu" },
            { role: "windowMenu" },
          ])
        }
      >
        Set application menu
      </button>
      <button
        onContextMenu={(event) => {
          event.preventDefault();
          const { clientX: x, clientY: y } = event;
          void action.run(() =>
            platform.menus.showContextMenu(
              [
                { id: "ctx.one", label: "One" },
                { id: "ctx.two", label: "Two" },
                { type: "separator" },
                { role: "copy" },
              ],
              { x, y },
            ),
          );
        }}
      >
        Right-click me
      </button>
      <div>Last menu action: {lastAction || "none"}</div>
      <Output action={action} testId="menu-output" />
    </Section>
  );
}

function SystemSection() {
  const platform = usePlatform();
  const action = useAction();
  const [links, setLinks] = useState<string[]>([]);
  useEffect(() => platform.deepLinks.onOpen((url) => setLinks((l) => [url, ...l])), [platform]);
  return (
    <Section title="Dialogs, clipboard, secrets, links" testId="system">
      <button
        onClick={() =>
          action.run(() => platform.dialogs.message({ message: "Hello", buttons: ["OK", "Other"] }))
        }
      >
        Message
      </button>
      <button
        onClick={() => action.run(() => platform.dialogs.confirm({ message: "Are you sure?" }))}
      >
        Confirm
      </button>
      <button
        onClick={() =>
          action.run(async () =>
            (await platform.dialogs.openFiles({ multiple: true })).map(
              (f) => `${f.name} ${f.data.byteLength} B`,
            ),
          )
        }
      >
        Open files
      </button>
      <button
        onClick={() =>
          action.run(() =>
            platform.dialogs.saveFile({ defaultName: "export.md", content: "# Export\n" }),
          )
        }
      >
        Save file
      </button>
      <br />
      <button
        onClick={() =>
          action.run(() => platform.clipboard.writeText(`copied at ${new Date().toISOString()}`))
        }
      >
        Copy
      </button>
      <button onClick={() => action.run(() => platform.clipboard.readText())}>Paste</button>
      <br />
      <button
        data-testid="secret-set"
        onClick={() => action.run(() => platform.secrets.set("diagnostics.token", "s3cret"))}
      >
        Set secret
      </button>
      <button
        data-testid="secret-get"
        onClick={() => action.run(() => platform.secrets.get("diagnostics.token"))}
      >
        Get secret
      </button>
      <button onClick={() => action.run(() => platform.secrets.delete("diagnostics.token"))}>
        Delete secret
      </button>
      <br />
      <button onClick={() => action.run(() => platform.openExternal("https://example.com"))}>
        Open example.com
      </button>
      <button onClick={() => action.run(() => platform.openExternal("file:///etc/passwd"))}>
        Try file:// (rejected)
      </button>
      <a href="https://example.com/link" target="_blank" rel="noreferrer">
        target=_blank link
      </a>
      <div>
        Deep links ({platform.deepLinks.scheme ?? "not registered"}): {links.join(", ") || "none"}
      </div>
      <Output action={action} testId="system-output" />
    </Section>
  );
}

function UpdaterSection() {
  const platform = usePlatform();
  const [state, setState] = useState<UpdateState>(platform.updater.state());
  useEffect(() => platform.updater.onStateChange(setState), [platform]);
  const action = useAction();
  return (
    <Section title="Updater" testId="updater">
      <pre data-testid="update-state">{JSON.stringify(state)}</pre>
      <button onClick={() => action.run(() => platform.updater.check())}>Check</button>
      <button onClick={() => action.run(() => platform.updater.download())}>Download</button>
      <button onClick={() => platform.updater.restartToUpdate()}>Restart to update</button>
      <Output action={action} testId="updater-output" />
    </Section>
  );
}

function ServicesSection() {
  const platform = usePlatform();
  const action = useAction();
  const [ticks, setTicks] = useState<string>("");
  const [ticking, setTicking] = useState(false);
  const channel = platform.services;
  useEffect(() => {
    if (!ticking || !channel) return;
    const client = serviceClient(channel, diagnosticsService);
    return client.subscribe("ticks", { intervalMs: 250 }, (event) =>
      setTicks(`tick ${event.n}, ${Date.now() - event.sentAt} ms in flight`),
    );
  }, [channel, ticking]);
  if (!channel) return null;
  const client = serviceClient(channel, diagnosticsService);
  return (
    <Section title="Service channel" testId="services">
      <button
        data-testid="bench-run"
        onClick={() =>
          action.run(async () => {
            const result: Record<string, string> = {};
            for (let i = 0; i < 20; i++) await client.request("echo", { value: "warm" });
            let start = performance.now();
            for (let i = 0; i < 200; i++) await client.request("echo", { value: "x" });
            result.echoRoundTrip = `${((performance.now() - start) / 200).toFixed(3)} ms`;
            for (const count of [100, 1000, 10000]) {
              start = performance.now();
              const runs = count >= 10000 ? 5 : 20;
              for (let i = 0; i < runs; i++) await client.request("rows", { count });
              result[`rows${count}`] = `${((performance.now() - start) / runs).toFixed(2)} ms`;
            }
            return result;
          })
        }
      >
        Benchmark IPC
      </button>
      <button onClick={() => setTicking(!ticking)}>
        {ticking ? "Stop ticks" : "Subscribe to ticks"}
      </button>
      <div>{ticks}</div>
      <Output action={action} testId="bench-output" />
    </Section>
  );
}

function Diagnostics() {
  return (
    <>
      <TitleBar />
      <main>
        <InfoSection />
        <FolderSection />
        <FilesSection />
        <WatchSection />
        <WindowSection />
        <MenuSection />
        <SystemSection />
        <UpdaterSection />
        <ServicesSection />
      </main>
    </>
  );
}

const platform = getInjectedPlatform();
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    {platform ? (
      <PlatformProvider platform={platform}>
        <Diagnostics />
      </PlatformProvider>
    ) : (
      <p>No platform injected: open this page in the Lydie desktop app.</p>
    )}
  </StrictMode>,
);
