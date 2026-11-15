import {
  actorRef,
  hasScope,
  LYDIE_VERSION,
  LydieError,
  operations as defaultRegistry,
} from "@lydie/contract";
import type {
  Actor,
  AnyOperation,
  EventDataOf,
  EventType,
  InputOf,
  InverseStep,
  LydieEvent,
  Operations,
  OutputOf,
  ParsedInputOf,
  Registry,
  SchemaRewrite,
  Scope,
} from "@lydie/contract";
import { z } from "zod";

import { recordActivity } from "./activity.ts";
import type { ActivityHint } from "./activity.ts";
import { indexBody } from "./handlers/doc.ts";
import { coreHandlers } from "./handlers/index.ts";
import { createHistory, touchesOf } from "./history.ts";
import type { History, HistoryStep } from "./history.ts";
import type {
  Blob,
  Clock,
  Db,
  DbRead,
  DbTx,
  Events,
  Exports,
  HistoryRow,
  Ids,
  Search,
  Versions,
} from "./ports.ts";
import { extract as defaultExtract } from "./text.ts";
import type { Extract, ExtractedLink } from "./text.ts";
import { uuid } from "./uuid.ts";

type BaseContext = {
  actor: Actor;
  // The agent session (MCP connection, CLI run) the operation runs in, if any.
  sessionId: string | null;
  search: Search;
  blob: Blob | undefined;
  exports: Exports | undefined;
  versions: Versions | undefined;
  ids: Ids;
  extract: Extract;
  /** @deprecated Use `extract(markdown).links`. */
  extractLinks: (markdown: string) => ExtractedLink[];
};

export type QueryContext = BaseContext & {
  tx: DbRead;
  // How far a long query has got (workspace.export), from `ExecuteOptions.onProgress`.
  progress?: (progress: { done: number; total: number }) => void;
};

export type MutationContext = BaseContext & {
  tx: DbTx;
  // One timestamp per transaction, so every row it touches agrees.
  now: string;
  // `actorRef(actor)`, for `createdBy`/`updatedBy`.
  actorRef: string;
  // Id of the operation log entry; events carry it.
  operationId: string;
  // Shared by every operation of one transaction (one undo step).
  groupId: string;
  // Queue an event; it is published after the transaction commits. It is also written to the
  // activity log; `activity` adds what the event cannot say (see `ActivityHint`).
  emit<T extends EventType>(
    type: T,
    workspaceId: string,
    data: EventDataOf<T>,
    activity?: ActivityHint,
  ): void;
  // Record values the client resolved (minted ids, sort keys) into the logged input, so the server
  // replays the same operation instead of re-deciding them.
  pin(values: Record<string, unknown>): void;
  // Record an operation that undoes (part of) this one. Undo runs them in reverse order of
  // recording, as ordinary operations. Required for operations declared `undo: "inverse"`.
  inverse(op: string, input: unknown, options?: { rewrite?: SchemaRewrite }): void;
  // The schema rewrite this execution belongs to: set while undoing (or redoing) one, from the
  // journal's inverse step. Never set from an operation's input.
  readonly rewrite?: SchemaRewrite;
  // What the history journal records as this operation's input, when the input itself is large
  // and something smaller says the same (a body edit instead of the whole body). It must be a valid
  // input of the operation. The upload queue still gets the real input.
  journal?(input: Record<string, unknown>): void;
  // Run another mutation inside this transaction (composite operations only). It is logged on its
  // own; the composite is not.
  exec(op: string, input: unknown, options?: { rewrite?: SchemaRewrite }): Promise<unknown>;
  // Run after the transaction commits (side effects that cannot roll back, e.g. deleting bytes).
  afterCommit(fn: () => void | Promise<void>): void;
};

export type Handler<O extends AnyOperation> = (
  ctx: O["kind"] extends "query" ? QueryContext : MutationContext,
  input: ParsedInputOf<O>,
) => Promise<z.input<O["output"]>>;

export type Handlers<R extends Registry> = { [K in keyof R]?: Handler<R[K]> };

type Namespaces<R> = keyof R & string extends infer K
  ? K extends `${infer N}.${string}`
    ? N
    : never
  : never;

// `ops.doc.move(input)`: one typed function per operation, grouped by the id's namespace.
export type OpsProxy<R extends Registry> = {
  readonly [N in Namespaces<R>]: {
    readonly [K in keyof R & `${N}.${string}` as K extends `${N}.${infer M}` ? M : never]: (
      input: InputOf<R[K]>,
    ) => Promise<OutputOf<R[K]>>;
  };
};

export type ExecuteOptions = {
  actor?: Actor;
  // Granted scopes. "*" grants everything (the local default). Locally this is advisory: the core
  // re-checks every uploaded operation with real permissions.
  scopes?: readonly Scope[] | "*";
  // Agent session id, recorded on every log entry so the session can be listed and undone.
  sessionId?: string;
  // Undo stack to record on (a window or tab id). Default "default"; for `as()` actors
  // `actor:<ActorRef>`, so an agent's changes never land on the user's Cmd+Z.
  scope?: string;
  // false: do not put this on an undo stack (still journaled, so session undo works). Use it for
  // body saves from the editor, which has its own text history.
  history?: boolean;
  // false: write nothing to the activity log, for every operation of this execution or
  // transaction, composite steps included (a new workspace's Getting started page). Still
  // journaled, logged and published.
  activity?: boolean;
  // Merge into the previous undo step if it has the same key and is recent (typing in a title).
  coalesce?: string;
  // Undo step label; defaults to the operation summary.
  label?: string;
  // Progress of a long query (workspace.export: entries written of all entries).
  onProgress?: (progress: { done: number; total: number }) => void;
};

export type RuntimeConfig<R extends Registry = Operations> = {
  db: Db;
  search: Search;
  actor: Actor;
  scopes?: readonly Scope[] | "*";
  blob?: Blob;
  // Where workspace.export puts the zip.
  exports?: Exports;
  // Version history of bodies (doc.listVersions, doc.getVersion, doc.restoreVersion).
  versions?: Versions;
  events?: Events;
  clock?: Clock;
  ids?: Ids;
  registry?: R;
  // Merged over the core handlers. Every operation in the registry must end up with a handler.
  handlers?: Handlers<R>;
  // Body analysis (links, block ids, headings, tags, plain text). Pass @lydie/markdown's.
  extract?: Extract;
  /** @deprecated Pass `extract`. Used for links only when `extract` is not given. */
  extractLinks?: (markdown: string) => ExtractedLink[];
  // Events are published after commit; a failing subscriber must not look like a failed operation.
  onEventError?: (error: unknown) => void;
  // Undo steps kept per scope.
  historyLimit?: number;
  // Window in which `coalesce` merges steps.
  coalesceMs?: number;
};

export type Runtime<R extends Registry = Operations> = {
  readonly registry: R;
  readonly ops: OpsProxy<R>;
  execute<K extends keyof R & string>(
    id: K,
    input: InputOf<R[K]>,
    options?: ExecuteOptions,
  ): Promise<OutputOf<R[K]>>;
  // The same operations, run as another actor (for example an MCP agent session).
  as(
    actor: Actor,
    scopes?: readonly Scope[] | "*",
    options?: Omit<ExecuteOptions, "actor" | "scopes">,
  ): OpsProxy<R>;
  // Runs several operations as one database transaction and one undo step. Inside `fn`, use the
  // `ops` it receives: calling `runtime.ops` there would wait for the transaction and deadlock.
  transaction<T>(
    label: string,
    fn: (ops: OpsProxy<R>) => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T>;
  readonly history: History;
  // Re-extracts every stored body of a workspace (links and `^id` blocks) with this runtime's
  // extractor, for a database whose bodies were saved by an older one (LYD-208). Derived rows only:
  // nothing is journaled, queued for upload or published, so run it on local stores only.
  reindexBodies(
    workspaceId: string,
    options?: { batchSize?: number },
  ): Promise<{ documents: number }>;
};

type Frame = {
  tx: DbTx;
  now: string;
  groupId: string;
  actor: Actor;
  sessionId: string | null;
  scope: string;
  scopes: readonly Scope[] | "*";
  activity: boolean;
  events: LydieEvent[];
  entries: HistoryRow[];
  afterCommit: (() => void | Promise<void>)[];
};

// Handlers are checked per operation at the type level; here they are called generically.
type LooseHandler = (ctx: QueryContext | MutationContext, input: unknown) => Promise<unknown>;

export function createRuntime<R extends Registry = Operations>(
  config: RuntimeConfig<R>,
): Runtime<R> {
  const registry = (config.registry ?? defaultRegistry) as R;
  const handlers = { ...coreHandlers, ...config.handlers } as Record<
    string,
    LooseHandler | undefined
  >;
  const missing = Object.keys(registry).filter((id) => !handlers[id]);
  if (missing.length > 0) throw new Error(`No handler for ${missing.join(", ")}`);

  const clock = config.clock ?? { now: () => new Date() };
  const ids = config.ids ?? { uuid };
  const rawExtract: Extract =
    config.extract ??
    (config.extractLinks
      ? (markdown) => ({ ...defaultExtract(markdown), links: config.extractLinks!(markdown) })
      : defaultExtract);
  // Extraction (a full Markdown parse with the app's extractor) is a pure function of the text and
  // the slowest part of saving a large body. Operations whose input carries `markdown` extract it
  // before taking the write lock (`execute`), so the transaction, which in the browser holds the
  // one database connection, finds the result here instead of parsing while holding it.
  const extracted = new Map<string, ReturnType<Extract>>();
  const extract: Extract = (markdown) => {
    const hit = extracted.get(markdown);
    if (hit) return hit;
    return rawExtract(markdown);
  };
  const preExtract = (input: unknown) => {
    const markdown = (input as { markdown?: unknown } | null)?.markdown;
    if (typeof markdown !== "string" || markdown.length < 1024 || extracted.has(markdown)) return;
    extracted.set(markdown, rawExtract(markdown));
    // A few recent texts are enough: the entry is used by the operation that follows.
    while (extracted.size > 4) extracted.delete(extracted.keys().next().value!);
  };
  const extractLinks = (markdown: string) => extract(markdown).links;
  const onEventError = config.onEventError ?? ((error: unknown) => console.error(error));

  const base = (actor: Actor, sessionId: string | null): BaseContext => ({
    actor,
    sessionId,
    search: config.search,
    blob: config.blob,
    exports: config.exports,
    versions: config.versions,
    ids,
    extract,
    extractLinks,
  });

  function lookup(id: string): { op: AnyOperation; handler: LooseHandler } {
    const op = registry[id];
    const handler = handlers[id];
    if (!op || !handler) throw new LydieError("unknown_operation", `Unknown operation "${id}"`);
    return { op, handler };
  }

  // Runs one mutation inside an open transaction and journals it.
  async function apply(
    frame: Frame,
    id: string,
    rawInput: unknown,
    applyOptions: { rewrite?: SchemaRewrite | undefined } = {},
    // Run by a composite, whose own scopes were checked: a narrow scope (inbox:write) authorises
    // the steps its operation takes on the caller's behalf.
    step = false,
  ): Promise<unknown> {
    const { op, handler } = lookup(id);
    if (op.kind !== "mutation") {
      throw new LydieError("invalid_input", `${id} is a query, not an operation to apply`);
    }
    if (!step) checkScopes(op, frame.scopes);
    const input = parseInput(op, rawInput);
    const operationId = ids.uuid();
    const steps: InverseStep[] = [];
    let pinned: Record<string, unknown> = {};
    let firstWorkspace: string | null = null;
    let journaled: Record<string, unknown> | undefined;
    const emitted: { event: LydieEvent; hint: ActivityHint | undefined }[] = [];
    const ctx: MutationContext = {
      ...base(frame.actor, frame.sessionId),
      tx: frame.tx,
      now: frame.now,
      actorRef: actorRef(frame.actor),
      operationId,
      groupId: frame.groupId,
      emit(type, workspaceId, data, hint) {
        if (!op.emits.includes(type)) {
          throw new LydieError("internal", `${op.id} emitted undeclared event ${type}`);
        }
        firstWorkspace ??= workspaceId;
        const event = {
          id: ids.uuid(),
          type,
          workspaceId,
          at: frame.now,
          actor: frame.actor,
          operationId,
          sessionId: frame.sessionId,
          data,
        } as LydieEvent;
        frame.events.push(event);
        emitted.push({ event, hint });
      },
      pin(values) {
        pinned = { ...pinned, ...values };
      },
      inverse(stepOp, stepInput, stepOptions) {
        steps.push({
          op: stepOp,
          input: stepInput,
          ...(stepOptions?.rewrite ? { rewrite: stepOptions.rewrite } : {}),
        });
      },
      ...(applyOptions.rewrite ? { rewrite: applyOptions.rewrite } : {}),
      journal(value) {
        journaled = value;
      },
      exec(subId, subInput, execOptions) {
        if (!op.composite) {
          throw new LydieError("internal", `${op.id} is not composite and cannot run ${subId}`);
        }
        return apply(frame, subId, subInput, execOptions ?? {}, true);
      },
      afterCommit(fn) {
        frame.afterCommit.push(fn);
      },
    };
    const result = parseOutput(op, await handler(ctx, input));
    // Only this operation's own events: a composite's steps record theirs in their own `apply`.
    for (const { event, hint } of emitted) {
      if (!frame.activity || hint?.quiet) continue;
      await recordActivity(frame.tx, event, hint, () => ids.uuid());
    }
    if (op.composite) return result;

    const recorded = { ...(input as Record<string, unknown>), ...pinned };
    parseInput(op, recorded);
    const workspaceId = firstWorkspace ?? workspaceOf(recorded, result);
    await frame.tx.oplog.append({
      id: operationId,
      operation: op.id,
      input: recorded,
      actor: frame.actor,
      sessionId: frame.sessionId,
      workspaceId,
      createdAt: frame.now,
      version: LYDIE_VERSION,
    });
    const inverse = op.undo === "inverse" ? steps.reverse() : null;
    const entry: HistoryRow = {
      id: operationId,
      operation: op.id,
      input: journaled ?? recorded,
      inverse,
      touches: touchesOf(op.id, recorded, inverse),
      actor: frame.actor,
      sessionId: frame.sessionId,
      groupId: frame.groupId,
      scope: frame.scope,
      workspaceId,
      createdAt: frame.now,
      undoneAt: null,
    };
    await frame.tx.history?.append(entry);
    frame.entries.push(entry);
    return result;
  }

  function newFrame(tx: DbTx, options: ExecuteOptions | undefined): Frame {
    const actor = options?.actor ?? config.actor;
    return {
      tx,
      now: clock.now().toISOString(),
      groupId: ids.uuid(),
      actor,
      sessionId: options?.sessionId ?? null,
      scope: options?.scope ?? "default",
      scopes: options?.scopes ?? config.scopes ?? "*",
      activity: options?.activity ?? true,
      events: [],
      entries: [],
      afterCommit: [],
    };
  }

  // Opens a transaction, runs `body` in it, then publishes events and runs after-commit work.
  async function inTransaction<T>(
    options: ExecuteOptions | undefined,
    body: (frame: Frame) => Promise<T>,
  ): Promise<{ result: T; frame: Frame }> {
    let frame: Frame | undefined;
    const result = await config.db.write(async (tx) => {
      frame = newFrame(tx, options);
      return body(frame);
    });
    const done = frame!;
    if (done.events.length > 0 && config.events) {
      try {
        await config.events.publish(done.events);
      } catch (error) {
        onEventError(error);
      }
    }
    for (const fn of done.afterCommit) {
      try {
        await fn();
      } catch (error) {
        onEventError(error);
      }
    }
    return { result, frame: done };
  }

  function stepOf(frame: Frame, label: string, options?: ExecuteOptions): HistoryStep | null {
    if (frame.entries.length === 0) return null;
    // One change that cannot be undone makes the whole step not undoable.
    if (frame.entries.some((e) => e.inverse === null)) return null;
    const inverse = [...frame.entries].reverse().flatMap((e) => e.inverse ?? []);
    if (inverse.length === 0) return null;
    return {
      id: frame.groupId,
      label,
      scope: frame.scope,
      inverse,
      entryIds: frame.entries.map((e) => e.id),
      at: Date.parse(frame.now),
      ...(options?.coalesce ? { coalesce: options.coalesce } : {}),
    };
  }

  const history = createHistory({
    limit: config.historyLimit ?? 200,
    coalesceMs: config.coalesceMs ?? 1500,
    async run(step, scope) {
      const { frame } = await inTransaction({ scope }, async (f) => {
        for (const s of step.inverse) await apply(f, s.op, s.input, { rewrite: s.rewrite });
        await f.tx.history?.markUndone(step.entryIds, f.now);
      });
      return stepOf(frame, step.label);
    },
  });

  async function execute(id: string, rawInput: unknown, options?: ExecuteOptions) {
    const { op, handler } = lookup(id);
    if (op.kind === "query") {
      checkScopes(op, options?.scopes ?? config.scopes ?? "*");
      const input = parseInput(op, rawInput);
      const actor = options?.actor ?? config.actor;
      const progress = options?.onProgress ? { progress: options.onProgress } : {};
      return config.db.read(async (tx) =>
        parseOutput(
          op,
          await handler({ ...base(actor, options?.sessionId ?? null), tx, ...progress }, input),
        ),
      );
    }
    preExtract(rawInput);
    const { result, frame } = await inTransaction(options, (f) => apply(f, id, rawInput));
    if (options?.history !== false) {
      const step = stepOf(frame, options?.label ?? op.summary, options);
      if (step) history.record(step);
    }
    return result;
  }

  async function transaction<T>(
    label: string,
    fn: (ops: OpsProxy<R>) => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    const { result, frame } = await inTransaction(options, (f) =>
      fn(
        buildProxy(registry, async (id, input) => {
          const { op, handler } = lookup(id);
          if (op.kind === "mutation") return apply(f, id, input);
          checkScopes(op, f.scopes);
          return parseOutput(
            op,
            await handler({ ...base(f.actor, f.sessionId), tx: f.tx }, parseInput(op, input)),
          );
        }),
      ),
    );
    if (options?.history !== false) {
      const step = stepOf(frame, label, options);
      if (step) history.record(step);
    }
    return result;
  }

  async function reindexBodies(workspaceId: string, options: { batchSize?: number } = {}) {
    const batchSize = options.batchSize ?? 100;
    const entries = await config.db.read((tx) =>
      tx.docs.tree(workspaceId, { includeDeleted: true }),
    );
    let documents = 0;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize).map((e) => e.id);
      const bodies = await config.db.read(async (tx) => {
        const found: { id: string; version: string; markdown: string }[] = [];
        for (const id of batch) {
          const body = await tx.bodies.get(id);
          if (body) found.push({ id, ...body });
        }
        return found;
      });
      // Parsing happens here, between transactions: in the browser a write holds the one connection.
      const work = bodies.map((b) => ({ ...b, extracted: rawExtract(b.markdown) }));
      if (work.length === 0) continue;
      documents += await config.db.write(async (tx) => {
        const ctx = maintenanceContext(tx);
        let done = 0;
        for (const w of work) {
          const doc = await tx.docs.get(w.id);
          // Saved since it was read: that save indexed it with this extractor already.
          if (!doc || (await tx.bodies.get(w.id))?.version !== w.version) continue;
          await indexBody(ctx, doc, w.extracted);
          done++;
        }
        return done;
      });
    }
    return { documents };
  }

  // For derived-row upkeep outside any operation: there is nothing to journal, pin or undo.
  function maintenanceContext(tx: DbTx): MutationContext {
    const actor = config.actor;
    const refuse = () => {
      throw new LydieError("internal", "Not available while reindexing");
    };
    return {
      ...base(actor, null),
      tx,
      now: clock.now().toISOString(),
      actorRef: actorRef(actor),
      operationId: ids.uuid(),
      groupId: ids.uuid(),
      emit: () => {},
      pin: () => {},
      inverse: () => {},
      exec: refuse,
      afterCommit: refuse,
    };
  }

  const proxy = (options?: ExecuteOptions) =>
    buildProxy(registry, (id, input) => execute(id, input, options));
  return {
    registry,
    ops: proxy(),
    execute: execute as Runtime<R>["execute"],
    as: (actor, scopes, options) =>
      proxy({
        scope: `actor:${actorRef(actor)}`,
        ...options,
        actor,
        ...(scopes ? { scopes } : {}),
      }),
    transaction,
    history,
    reindexBodies,
  };
}

function buildProxy<R extends Registry>(
  registry: R,
  execute: (id: string, input: unknown) => Promise<unknown>,
): OpsProxy<R> {
  const root: Record<string, Record<string, (input: unknown) => Promise<unknown>>> = {};
  for (const id of Object.keys(registry)) {
    const dot = id.indexOf(".");
    const ns = (root[id.slice(0, dot)] ??= {});
    ns[id.slice(dot + 1)] = (input) => execute(id, input);
  }
  return root as OpsProxy<R>;
}

function checkScopes(op: AnyOperation, granted: readonly Scope[] | "*"): void {
  if (granted === "*") return;
  const missing = op.scopes.filter((scope) => !hasScope(granted, scope));
  if (missing.length > 0) {
    throw new LydieError("forbidden", `${op.id} requires ${missing.join(", ")}`, {
      hint: "Ask for a token with the missing scopes.",
    });
  }
}

function parseInput(op: AnyOperation, input: unknown): unknown {
  const result = op.input.safeParse(input);
  if (!result.success) {
    throw new LydieError("invalid_input", z.prettifyError(result.error), {
      details: result.error.issues,
    });
  }
  return result.data;
}

function parseOutput(op: AnyOperation, output: unknown): unknown {
  const result = op.output.safeParse(output);
  if (!result.success) {
    throw new LydieError("internal", `${op.id} returned invalid output`, {
      details: result.error.issues,
    });
  }
  return result.data;
}

function workspaceOf(input: Record<string, unknown>, output: unknown): string | null {
  if (typeof input.workspaceId === "string") return input.workspaceId;
  const doc = (output as { document?: { workspaceId?: unknown } } | null)?.document ?? output;
  const workspaceId = (doc as { workspaceId?: unknown } | null)?.workspaceId;
  return typeof workspaceId === "string" ? workspaceId : null;
}
