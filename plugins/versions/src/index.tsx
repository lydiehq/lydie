// Version history of the open document: the versions the workspace keeps (snapshots, or git when
// the folder uses it), what one said, and putting it back. Everything goes through the contract's
// doc.listVersions, doc.getVersion and doc.restoreVersion.
import { definePlugin, docIdOf, useApp, useQuerySelect } from "@lydie/plugin-api";
import type { DocumentVersion, TabInfo } from "@lydie/plugin-api";
import {
  Button,
  EmptyState,
  focusRingInsetClass,
  HistoryAnticlockwiseRegular,
  NoDocumentIllustration,
  VersionsIllustration,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { versionTime, versionTitle } from "./format.ts";

type Loaded = { id: string; versions: DocumentVersion[] } | { id: string; error: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function VersionsPanel({ activeTab }: { activeTab: TabInfo | null }) {
  const app = useApp();
  const id = docIdOf(activeTab?.path);
  // Every save moves `updatedAt`, so the list follows the document.
  const updatedAt = useQuerySelect(
    "doc.get",
    id ? { id } : null,
    (s) => s.data[0]?.document.updatedAt ?? null,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [open, setOpen] = useState<{ versionId: string; markdown: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    app.backend
      .execute("doc.listVersions", { id, limit: 50 })
      .then(({ versions }) => live && setLoaded({ id, versions }))
      .catch((error: unknown) => live && setLoaded({ id, error: message(error) }));
    return () => {
      live = false;
    };
  }, [app, id, updatedAt]);

  if (!id) {
    return (
      <EmptyState
        title="No document open"
        illustration={<NoDocumentIllustration size="sm" />}
        description="Earlier versions of the open document show here."
      />
    );
  }
  if (!loaded || loaded.id !== id)
    return <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>;
  if ("error" in loaded) {
    return <EmptyState title="No version history" description={loaded.error} />;
  }
  if (loaded.versions.length === 0) {
    return (
      <EmptyState
        title="No versions yet"
        illustration={<VersionsIllustration size="sm" />}
        description="A version is kept when this document changes."
      />
    );
  }

  const show = (version: DocumentVersion) => {
    if (open?.versionId === version.id) {
      setOpen(null);
      return;
    }
    setOpen({ versionId: version.id, markdown: null });
    app.backend
      .execute("doc.getVersion", { id, versionId: version.id })
      .then(({ markdown }) =>
        setOpen((now) =>
          now?.versionId === version.id ? { versionId: version.id, markdown } : now,
        ),
      )
      .catch((error: unknown) => {
        setOpen(null);
        app.notify({
          title: "Could not open the version",
          description: message(error),
          kind: "error",
        });
      });
  };

  const restore = async (version: DocumentVersion) => {
    const ok = await app.confirm({
      message: "Restore this version?",
      detail: "The document will read as it did then. What it says now is kept as a version.",
      confirmLabel: "Restore",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await app.backend.ops.doc.restoreVersion(
        { id, versionId: version.id },
        { scope: app.historyScope(), label: "Restore version" },
      );
      setOpen(null);
      app.notify({ title: "Version restored", kind: "success" });
    } catch (error) {
      app.notify({ title: "Could not restore", description: message(error), kind: "error" });
    }
    setBusy(false);
  };

  return (
    <ul aria-label="Versions" className="flex flex-col gap-0.5 p-1" data-testid="versions-panel">
      {loaded.versions.map((version) => {
        const expanded = open?.versionId === version.id;
        return (
          <li key={version.id} data-testid="version">
            <button
              type="button"
              aria-expanded={expanded}
              className={`${focusRingInsetClass} flex w-full flex-col items-start rounded-lg px-2 py-1 text-left text-gray-600 hover:bg-gray-950/3 aria-expanded:bg-gray-950/5`}
              onClick={() => show(version)}
            >
              <span className="w-full truncate text-sm font-medium">{versionTitle(version)}</span>
              <span className="text-xs text-gray-500">{versionTime(version.createdAt)}</span>
            </button>
            {expanded && (
              <div className="flex flex-col gap-2 px-2 pb-2">
                <pre className="max-h-64 overflow-auto rounded-md bg-gray-950/5 p-2 text-xs whitespace-pre-wrap">
                  {open.markdown ?? "Loading…"}
                </pre>
                <div>
                  <Button
                    size="xs"
                    variant="secondary"
                    isDisabled={busy || open.markdown === null}
                    onPress={() => void restore(version)}
                  >
                    Restore this version
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export const versionsPlugin = definePlugin({
  id: "versions",
  name: "Version history",
  description: "Earlier versions of a document, and restoring one.",
  activate(ctx) {
    // Folder workspaces keep versions (snapshots or git). Hosted and browser workspaces get the
    // panel when their backends can answer the same operations.
    if (!ctx.app.services?.vault) return;
    ctx.panels.register({ id: "versions", title: "History", order: 30, component: VersionsPanel });
    ctx.commands.register({
      id: "versions.show",
      title: "Show version history",
      icon: <HistoryAnticlockwiseRegular />,
      group: "View",
      run: ({ app }) => app.panels.show("versions"),
    });
  },
});

export default versionsPlugin;
