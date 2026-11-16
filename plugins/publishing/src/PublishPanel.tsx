import { docIdOf, useApp } from "@lydie/plugin-api";
import type { TabInfo } from "@lydie/plugin-api";
import { useAccount, useHostedQuery } from "@lydie/plugin-api/hosted";
import type { Publication, PublicationItem, PublicationRun } from "@lydie/plugin-api/hosted";
import {
  Button,
  EmptyState,
  ErrorState,
  Link,
  LoadingState,
  Select,
  SelectItem,
  Switch,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { AdminsOnly, errorText } from "./ConnectionsPage.tsx";
import { divergenceView } from "./divergence.ts";
import { refreshFolderMarks } from "./folder-marks.ts";
import { fieldsOf, initialValues, toValue, validate } from "./schema-form.ts";
import type { FormValues, JsonSchema } from "./schema-form.ts";
import { SchemaForm } from "./SchemaForm.tsx";

const STATES: Record<PublicationItem["state"], string> = {
  draft: "Not published yet",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Published",
  updated_pending: "Changed since it was published",
  failed: "Failed",
  unpublished: "Unpublished",
  diverged: "Changed at the destination",
};

const textOf = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

// The run an action started, if it started one.
const runOf = (result: unknown) => (result as { run?: PublicationRun } | undefined)?.run ?? null;

const FINISHED = new Set<PublicationRun["status"]>(["succeeded", "partial", "failed", "cancelled"]);

const RUN_STATES: Record<PublicationRun["status"], string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Done",
  partial: "Partly done",
  failed: "Failed",
  cancelled: "Cancelled",
};

// The right panel's "Publish" tab: where the open document is published, and doing it.
export function PublishPanel({ activeTab }: { activeTab: TabInfo | null }) {
  const { api } = useAccount();
  const documentId = docIdOf(activeTab?.path);
  if (!api || api.scope.kind !== "hosted") {
    return (
      <EmptyState
        title="Publishing needs a cloud workspace"
        description="Put this workspace in Lydie Cloud to publish documents to GitHub, WordPress or a webhook."
      />
    );
  }
  if (!documentId) return <EmptyState title="Open a document to publish it" />;
  return (
    <AdminsOnly>
      <Publications key={documentId} documentId={documentId} />
    </AdminsOnly>
  );
}

function Publications({ documentId }: { documentId: string }) {
  const app = useApp();
  const workspaceId = app.workspace.workspaceId;
  const publications = useHostedQuery("publication.list", { workspaceId, documentId });
  const connections = useHostedQuery("connection.list", { workspaceId });
  const connectors = useHostedQuery("connector.list", {});
  const api = app.services!.account!;
  const [adding, setAdding] = useState(false);
  // Runs the person started here, until they finish (publication id → run id).
  const [watching, setWatching] = useState<ReadonlyMap<string, string>>(new Map());
  const watch = (run: PublicationRun | null) => {
    if (run) setWatching((m) => new Map(m).set(run.publicationId, run.id));
  };
  const list = publications.data?.publications ?? [];
  // Runs are queued and finish in the background: refresh quickly while one is in flight (a new
  // publication has no items until its first run), and now and then otherwise, since the server
  // marks edited documents, publishes them automatically and finds edits at the destination on
  // its own schedule.
  const busy =
    watching.size > 0 ||
    list.some(
      (p) =>
        p.items.length === 0 ||
        p.items.some((i) => i.state === "publishing" || i.state === "scheduled"),
    );
  const any = list.length > 0;
  useEffect(() => {
    if (!busy && !any) return;
    const timer = setInterval(
      async () => {
        for (const [publicationId, runId] of watching) {
          const { runs } = await api
            .call("publication.runs", { id: publicationId, runId })
            .catch(() => ({ runs: [] as PublicationRun[] }));
          const run = runs[0];
          if (!run || FINISHED.has(run.status)) {
            setWatching((m) => {
              const next = new Map(m);
              next.delete(publicationId);
              return next;
            });
          }
        }
        await publications.reload();
        refreshFolderMarks();
      },
      busy ? 1500 : 10_000,
    );
    return () => clearInterval(timer);
  }, [busy, any, watching, publications, api]);

  return (
    <div className="flex flex-col gap-3 p-3 text-sm" data-testid="publish-panel">
      {publications.error && !publications.data && (
        <ErrorState
          title="Could not load where it is published"
          error={errorText(publications.error)}
        />
      )}
      {publications.isLoading && !publications.data && <LoadingState />}
      {list.map((p) => (
        <PublicationCard
          key={p.id}
          publication={p}
          documentId={documentId}
          name={
            connections.data?.connections.find((c) => c.id === p.connectionId)?.name ?? p.connector
          }
          canPull={
            connectors.data?.connectors.find((c) => c.id === p.connector)?.capabilities.pull ??
            false
          }
          running={watching.has(p.id)}
          watch={watch}
          reload={publications.reload}
        />
      ))}
      {publications.data && list.length === 0 && !adding && (
        <p className="text-xs text-gray-500">This document is not published anywhere.</p>
      )}
      {adding ? (
        <NewPublication
          documentId={documentId}
          close={() => setAdding(false)}
          created={(run) => {
            watch(run);
            void publications.reload();
          }}
        />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onPress={() => setAdding(true)}
        >
          Publish to…
        </Button>
      )}
    </div>
  );
}

function NewPublication({
  documentId,
  close,
  created,
}: {
  documentId: string;
  close: () => void;
  created: (run: PublicationRun | null) => void;
}) {
  const app = useApp();
  const api = app.services!.account!;
  const connections = useHostedQuery("connection.list", { workspaceId: app.workspace.workspaceId });
  const connectors = useHostedQuery("connector.list", {});
  const list = connections.data?.connections ?? [];
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const connection = list.find((c) => c.id === connectionId) ?? list[0] ?? null;
  const connector = connectors.data?.connectors.find((c) => c.id === connection?.connector);
  const fields = fieldsOf(connector?.configSchema as JsonSchema | undefined);
  const [values, setValues] = useState<FormValues | null>(null);
  const shown = values ?? initialValues(fields);
  const [subpages, setSubpages] = useState(false);
  const [auto, setAuto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (connections.data && list.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-gray-950/8 p-2 text-xs text-gray-600">
        <p>Connect a destination first.</p>
        <Button
          size="xs"
          className="self-start"
          onPress={() => app.overlays.open("settings", { page: "connections" })}
        >
          Open connections
        </Button>
      </div>
    );
  }

  const submit = async () => {
    if (!connection) return;
    const problems = validate(fields, shown);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.call("publication.create", {
        documentId,
        connectionId: connection.id,
        includeSubpages: subpages,
        autoPublish: auto,
        config: toValue(fields, shown),
        publishNow: true,
      });
      created(result.run);
      close();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-950/8 p-2">
      <Select
        label="Destination"
        selectedKey={connection?.id ?? null}
        onSelectionChange={(key) => {
          setConnectionId(String(key));
          setValues(null);
        }}
      >
        {list.map((c) => (
          <SelectItem key={c.id} id={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </Select>
      <SchemaForm
        idPrefix="publication"
        fields={fields}
        values={shown}
        errors={errors}
        onChange={setValues}
      />
      <Switch isSelected={subpages} onChange={setSubpages}>
        Include subpages
      </Switch>
      <Switch isSelected={auto} onChange={setAuto}>
        Publish changes automatically
      </Switch>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="xs" variant="ghost" onPress={close}>
          Cancel
        </Button>
        <Button size="xs" onPress={() => void submit()} isPending={busy} isDisabled={!connection}>
          Publish
        </Button>
      </div>
    </div>
  );
}

function PublicationCard({
  publication,
  documentId,
  name,
  canPull,
  running,
  watch,
  reload,
}: {
  publication: Publication;
  documentId: string;
  name: string;
  canPull: boolean;
  running: boolean;
  watch: (run: PublicationRun | null) => void;
  reload: () => Promise<void>;
}) {
  const app = useApp();
  const api = app.services!.account!;
  const [showRuns, setShowRuns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A connected folder's own document is not a page at the destination: it has no item, and
  // the card speaks for the folder instead of borrowing its first page's state.
  const isFolderRoot = publication.folder && publication.documentId === documentId;
  const item = isFolderRoot
    ? undefined
    : (publication.items.find((i) => i.documentId === documentId) ?? publication.items[0]);
  const pages = publication.items.filter((i) => i.state !== "unpublished").length;
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    try {
      watch(runOf(await fn()));
      await reload();
    } catch (e) {
      setError(`Could not ${label}: ${errorText(e)}`);
    }
  };
  return (
    <section
      aria-label={`Published to ${name}`}
      className="flex flex-col gap-2 rounded-md border border-gray-950/8 p-2"
      data-testid="publication"
    >
      <div className="flex items-center gap-2">
        <span className="grow truncate font-medium text-gray-900">{name}</span>
        <span className="text-xs text-gray-500" data-testid="publication-state">
          {isFolderRoot
            ? `Connected folder · ${pages} ${pages === 1 ? "page" : "pages"}`
            : item
              ? STATES[item.state]
              : "Not published yet"}
        </span>
        {running && (
          <span className="text-xs text-gray-400" data-testid="publication-running">
            · Working…
          </span>
        )}
      </div>
      {item?.externalUrl && (
        <Link href={item.externalUrl} target="_blank" rel="noreferrer" className="truncate text-xs">
          {item.externalUrl}
        </Link>
      )}
      {item?.state === "failed" && item.lastError && (
        <p className="text-xs text-red-600">
          {textOf((item.lastError as { message?: unknown }).message ?? item.lastError)}
        </p>
      )}
      {item?.state === "diverged" && (
        <Diverged
          divergence={item.divergence}
          resolutions={canPull ? ["overwrite", "keepRemote", "pull"] : ["overwrite", "keepRemote"]}
          resolve={(resolution) =>
            void act("resolve it", () =>
              api.call("publication.resolve", { id: publication.id, documentId, resolution }),
            )
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="xs"
          onPress={() =>
            void act("publish", () => api.call("publication.run", { id: publication.id }))
          }
        >
          Publish now
        </Button>
        {canPull && publication.includeSubpages && (
          // A connected folder can start from the destination: documents are created here for
          // what it already has, and those files stay as they are until their documents change.
          <Button
            size="xs"
            variant="secondary"
            onPress={() =>
              void act("bring them in", () =>
                api.call("publication.run", { id: publication.id, import: true }),
              )
            }
          >
            Import existing
          </Button>
        )}
        <Button
          size="xs"
          variant="secondary"
          onPress={() =>
            void act("unpublish", () => api.call("publication.unpublish", { id: publication.id }))
          }
        >
          Unpublish
        </Button>
        <Button size="xs" variant="ghost" onPress={() => setShowRuns(!showRuns)}>
          {showRuns ? "Hide log" : "Log"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onPress={async () => {
            if (
              !(await app.confirm({
                message: `Stop publishing to ${name}?`,
                detail: "What was published stays there; use Unpublish to take it down first.",
                confirmLabel: "Stop publishing",
                destructive: true,
              }))
            )
              return;
            await act("remove it", () => api.call("publication.delete", { id: publication.id }));
          }}
        >
          Remove
        </Button>
      </div>
      <Switch
        isSelected={publication.autoPublish}
        onChange={(autoPublish) =>
          void act("change it", () =>
            api.call("publication.update", { id: publication.id, autoPublish }),
          )
        }
      >
        Publish changes automatically
      </Switch>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {showRuns && (
        <RunLog
          // A new run or state change reloads the log.
          key={`${publication.lastRunAt}:${publication.items.map((i) => i.state).join()}`}
          publicationId={publication.id}
        />
      )}
    </section>
  );
}

type Resolution = "overwrite" | "keepRemote" | "pull";

const RESOLUTIONS: Record<Resolution, string> = {
  overwrite: "Overwrite with this",
  keepRemote: "Keep theirs",
  pull: "Pull theirs in here",
};

function Diverged({
  divergence,
  resolutions,
  resolve,
}: {
  divergence: Record<string, unknown> | null;
  resolutions: Resolution[];
  resolve: (resolution: Resolution) => void;
}) {
  const view = divergenceView(divergence);
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900"
      data-testid="publication-diverged"
    >
      <p>{view.reason} Which version should win?</p>
      {view.marked ? (
        <pre className="max-h-40 overflow-auto rounded bg-surface p-1 text-[11px] whitespace-pre-wrap">
          {view.marked}
        </pre>
      ) : (
        <>
          {view.theirs.length > 0 && (
            <DiffLines label="There" lines={view.theirs} className="bg-amber-100/60" />
          )}
          {view.ours.length > 0 && (
            <DiffLines label="Here" lines={view.ours} className="bg-surface" />
          )}
        </>
      )}
      {view.pullRequest && (
        <a href={view.pullRequest} target="_blank" rel="noreferrer" className="underline">
          Open the pull request
        </a>
      )}
      <div className="flex flex-wrap gap-1">
        {resolutions.map((resolution) => (
          <Button
            key={resolution}
            size="xs"
            variant="secondary"
            onPress={() => resolve(resolution)}
          >
            {RESOLUTIONS[resolution]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function DiffLines({
  label,
  lines,
  className,
}: {
  label: string;
  lines: string[];
  className: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{label}</span>
      <ul
        aria-label={`Changed ${label.toLowerCase()}`}
        className={`max-h-24 overflow-auto rounded p-1 text-[11px] ${className}`}
      >
        {lines.slice(0, 20).map((line, index) => (
          <li key={index} className="truncate">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunLog({ publicationId }: { publicationId: string }) {
  const runs = useHostedQuery("publication.runs", { id: publicationId, limit: 10 });
  const list = runs.data?.runs ?? [];
  if (runs.isLoading && !runs.data) return <LoadingState label="Loading the log" />;
  if (list.length === 0) return <p className="text-xs text-gray-500">No runs yet.</p>;
  return (
    <ol className="flex flex-col gap-2 text-xs" aria-label="Publish log">
      {list.map((run) => (
        <li key={run.id} className="flex flex-col gap-0.5 border-t border-gray-950/5 pt-1">
          <span className="text-gray-700">
            {run.action} · {RUN_STATES[run.status]} · {new Date(run.createdAt).toLocaleString()}
          </span>
          {run.steps.map((step, index) => (
            <span
              key={index}
              className={step.status === "error" ? "pl-2 text-red-600" : "pl-2 text-gray-500"}
            >
              {step.step}
              {step.ms !== undefined ? ` (${step.ms} ms)` : ""}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
