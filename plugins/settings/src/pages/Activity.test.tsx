// The Activity page against a fake backend: rows as sentences under day headings, an agent's
// session folded with its Undo, hosted windows reading the server, and an older server.
import { afterEach, beforeEach, expect, test } from "bun:test";

import { BackendProvider, HostProvider } from "@lydie/plugin-api";
import type { Activity, Backend, HostBridge, LiveState } from "@lydie/plugin-api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { activity } from "../activity/fixtures.ts";
import { ActivityPage } from "./Activity.tsx";

afterEach(cleanup);

const WS = "w1";
const PAGE = "11111111-1111-4111-8111-111111111111";
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const claude = { type: "agent", app: "claude-code", id: "s1", onBehalfOf: "local" } as const;
const SIGNED_IN = { status: "signed-in", user: { id: "local" } };

let items: Activity[];
let calls: { where: "local" | "server"; id: string; input: unknown }[];
let confirms: unknown[];
let notes: { title: string; description?: string; kind?: string }[];
let server: ((id: string, input: unknown) => Promise<unknown>) | null;

beforeEach(() => {
  items = [];
  calls = [];
  confirms = [];
  notes = [];
  server = null;
});

function answer(id: string): unknown {
  if (id === "activity.list") return { items, nextCursor: null };
  if (id === "history.listSessions") {
    return {
      sessions: [
        {
          sessionId: "s1",
          actor: claude,
          workspaceId: WS,
          firstAt: minutesAgo(30),
          lastAt: minutesAgo(5),
          count: 5,
          undoneCount: 2,
        },
        {
          sessionId: "s2",
          actor: claude,
          workspaceId: WS,
          firstAt: minutesAgo(90),
          lastAt: minutesAgo(80),
          count: 2,
          undoneCount: 2,
        },
      ],
    };
  }
  if (id === "history.undoSession") {
    return {
      undoneIds: ["a", "b"],
      skipped: [{ id: "c", operation: "doc.rename", reason: "conflict", message: "Changed" }],
    };
  }
  throw new Error(`unexpected ${id}`);
}

function show(mode: "local" | "synced" = "local") {
  const info = { mode, workspaceId: WS, workspaceName: "Test", persistent: true };
  const backend = {
    info,
    execute: async (id: string, input: unknown) => {
      calls.push({ where: "local", id, input });
      return answer(id);
    },
    live: (name: string, params: { id?: string }) => {
      const data =
        name === "doc.get" && params.id === PAGE
          ? [{ document: { id: PAGE, title: "Roadmap" }, body: null }]
          : [];
      const state: LiveState<unknown> = { data, isLoading: false, error: undefined };
      return { key: `${name}:${params.id}`, getSnapshot: () => state, subscribe: () => () => {} };
    },
  } as unknown as Backend;
  const host = {
    app: {
      backend,
      workspace: info,
      confirm: async (options: unknown) => {
        confirms.push(options);
        return true;
      },
      notify: (note: (typeof notes)[number]) => notes.push(note),
      historyScope: () => "default",
      overlays: { close() {} },
      openDoc() {},
      modeFor: () => "replace",
      services:
        mode === "synced"
          ? {
              account: {
                state: {
                  get: () => SIGNED_IN,
                  subscribe: () => () => {},
                },
                callContract: (id: string, input: unknown) => {
                  calls.push({ where: "server", id, input });
                  return server ? server(id, input) : Promise.resolve(answer(id));
                },
              },
            }
          : undefined,
    },
    contributions: { list: () => [], subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  return render(
    <BackendProvider backend={backend}>
      <HostProvider host={host}>
        <ActivityPage />
      </HostProvider>
    </BackendProvider>,
  );
}

test("reads rows as sentences and folds an agent's session, which can be undone", async () => {
  items = [
    activity({ type: "doc.bodyUpdated", targetId: PAGE, lastAt: minutesAgo(2) }),
    activity({ actor: claude, sessionId: "s1", type: "doc.renamed", lastAt: minutesAgo(5) }),
    activity({ actor: claude, sessionId: "s1", type: "doc.created", lastAt: minutesAgo(6) }),
    activity({ type: "attachment.created", targetTitle: "x.png", lastAt: minutesAgo(9) }),
  ];
  show();
  const list = await screen.findByTestId("activity-list");
  expect(within(list).getByRole("region", { name: "Today" })).toBeDefined();
  const rows = within(list).getAllByTestId("activity-item");
  expect(rows.map((r) => r.textContent?.replace(/\d+ minutes ago/, ""))).toEqual([
    "You edited Roadmap",
    "You added file x.png",
  ]);
  // The page is a link; the file is not.
  expect(within(rows[0]!).getByRole("button", { name: "Roadmap" })).toBeDefined();
  expect(within(rows[1]!).queryByRole("button")).toBeNull();

  const session = within(list).getByTestId("activity-session");
  expect(session.textContent).toContain("Claude Code made 2 changes in 1 page");
  fireEvent.click(within(session).getByRole("button", { name: "Show changes" }));
  expect(session.textContent).toContain("Renamed Roadmap");
  expect(session.textContent).toContain("Created Roadmap");

  const listCalls = () => calls.filter((c) => c.id === "activity.list").length;
  expect(listCalls()).toBe(1);
  const undo = await within(session).findByRole("button", { name: "Undo" });
  await act(async () => fireEvent.click(undo));
  await waitFor(() => expect(notes).toHaveLength(1));
  // The confirmation counts what the undo acts on (the journal: 5 changes, 2 undone before), as
  // the result does, not the summary's activity rows.
  expect(confirms).toEqual([
    expect.objectContaining({ message: "Undo 3 changes by Claude Code?" }),
  ]);
  expect(calls.find((c) => c.id === "history.undoSession")?.input).toEqual({ sessionId: "s1" });
  expect(notes[0]).toMatchObject({
    title: "Undid 2 changes",
    description: "Skipped 1 change: 1 changed later by someone else.",
    kind: "warning",
  });
  // The list reloads.
  await waitFor(() => expect(listCalls()).toBe(2));
  expect(calls.every((c) => c.where === "local")).toBe(true);
});

test("offers no Undo for someone else's session", async () => {
  items = [
    activity({ actor: { ...claude, onBehalfOf: "u9" }, sessionId: "s9" }),
    activity({ actor: { ...claude, onBehalfOf: "u9" }, sessionId: "s9" }),
  ];
  show();
  const session = await screen.findByTestId("activity-session");
  await waitFor(() => expect(calls.some((c) => c.id === "history.listSessions")).toBe(true));
  expect(within(session).queryByRole("button", { name: "Undo" })).toBeNull();
});

test("offers no Undo for a session with nothing left to undo", async () => {
  items = [
    activity({ actor: claude, sessionId: "s2", lastAt: minutesAgo(80) }),
    activity({ actor: claude, sessionId: "s2", lastAt: minutesAgo(81) }),
  ];
  show();
  const session = await screen.findByTestId("activity-session");
  await waitFor(() => expect(calls.some((c) => c.id === "history.listSessions")).toBe(true));
  expect(within(session).queryByRole("button", { name: "Undo" })).toBeNull();
});

test("a hosted window reads the workspace's activity from the server", async () => {
  items = [activity({ type: "doc.created", targetId: PAGE, lastAt: minutesAgo(1) })];
  show("synced");
  await screen.findByTestId("activity-list");
  expect(calls.filter((c) => c.id === "activity.list").map((c) => c.where)).toEqual(["server"]);
  expect(calls.some((c) => c.where === "local")).toBe(false);
});

test("an older server says activity is not available", async () => {
  server = async () => {
    throw Object.assign(new Error("Unknown operation"), { code: "unknown_operation" });
  };
  show("synced");
  expect(await screen.findByText("Activity is not available")).toBeDefined();
});

test("an error can be retried, and an empty log says so", async () => {
  let fail = true;
  server = async (id) => {
    if (id === "activity.list" && fail) {
      throw Object.assign(new Error("Server unreachable"), { kind: "network" });
    }
    return answer(id);
  };
  show("synced");
  const retry = await screen.findByRole("button", { name: "Try again" });
  fail = false;
  await act(async () => fireEvent.click(retry));
  expect(await screen.findByText("No activity yet")).toBeDefined();
});
