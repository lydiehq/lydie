import { describe, expect, it } from "bun:test";

import { appendTo, captureLine } from "./handlers/inbox.ts";
import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";

const WS = "01JWORKSPACE0000000000000A";

function setup(scopes?: Parameters<typeof createRuntime>[0]["scopes"]) {
  const ports = createMemoryPorts();
  return {
    ports,
    runtime: createRuntime({
      ...ports,
      actor: { type: "user", id: "u" },
      ...(scopes ? { scopes } : {}),
    }),
  };
}

describe("inbox.capture (LYD-385)", () => {
  it("formats a capture as a list item, extra lines indented", () => {
    expect(captureLine("Call Sam\nabout the plan", "09:07")).toBe(
      "- 09:07 Call Sam\n  about the plan",
    );
    expect(captureLine("No time")).toBe("- No time");
    expect(appendTo("", "- a")).toBe("- a\n");
    expect(appendTo("# Day\n\nSome text\n", "- a")).toBe("# Day\n\nSome text\n\n- a\n");
    expect(appendTo("- 09:00 first\n", "- b")).toBe("- 09:00 first\n- b\n");
  });

  it("creates the inbox once, then appends to it", async () => {
    const { runtime } = setup();
    const first = await runtime.ops.inbox.capture({
      workspaceId: WS,
      markdown: "Buy milk",
      time: "09:00",
    });
    expect(first.created).toBe(false);
    expect(first.documentId).toBe(first.inboxId);
    const second = await runtime.ops.inbox.capture({
      workspaceId: WS,
      markdown: "Read this",
      url: "https://example.com/a",
    });
    expect(second.inboxId).toBe(first.inboxId);
    const inbox = await runtime.ops.doc.get({ id: first.inboxId });
    expect(inbox.document).toMatchObject({ title: "Inbox", parentId: null });
    expect(inbox.body?.markdown).toBe("- 09:00 Buy milk\n- Read this https://example.com/a\n");
  });

  it("finds an existing inbox by title, whatever its case", async () => {
    const { runtime } = setup();
    const existing = await runtime.ops.doc.create({ workspaceId: WS, title: "inbox" });
    const result = await runtime.ops.inbox.capture({ workspaceId: WS, markdown: "x" });
    expect(result.inboxId).toBe(existing.id);
  });

  it("a titled capture is a page in the inbox with its source", async () => {
    const { runtime } = setup();
    const result = await runtime.ops.inbox.capture({
      workspaceId: WS,
      markdown: "# Heading\n\nClipped text.",
      title: "An article",
      url: "https://example.com/article",
    });
    expect(result.created).toBe(true);
    const page = await runtime.ops.doc.get({ id: result.documentId });
    expect(page.document).toMatchObject({
      title: "An article",
      parentId: result.inboxId,
      properties: { source: "https://example.com/article" },
    });
    expect(page.body?.markdown).toBe("# Heading\n\nClipped text.\n");
  });

  it("needs only inbox:write, which docs:write covers; docs:read alone is refused", async () => {
    const capture = { workspaceId: WS, markdown: "x", title: "A page" };
    expect((await setup(["inbox:write"]).runtime.ops.inbox.capture(capture)).created).toBe(true);
    expect((await setup(["docs:write"]).runtime.ops.inbox.capture(capture)).created).toBe(true);
    const readOnly = setup(["docs:read"]).runtime.ops.inbox.capture(capture);
    await expect(readOnly).rejects.toThrow("requires inbox:write");
    // The narrow scope does not reach anything else.
    const narrow = setup(["inbox:write"]).runtime.ops.doc.create({ workspaceId: WS, title: "x" });
    await expect(narrow).rejects.toThrow("requires docs:write");
  });

  it("logs its steps for replay, with the ids it minted, and undoes as one", async () => {
    const { runtime, ports } = setup();
    const result = await runtime.ops.inbox.capture({ workspaceId: WS, markdown: "x", title: "P" });
    const logged = ports.state.oplog;
    expect(logged.map((entry) => entry.operation)).toEqual(["doc.create", "doc.create"]);
    expect(logged.map((entry) => (entry.input as { id?: string }).id)).toEqual([
      result.inboxId,
      result.documentId,
    ]);
    expect(await runtime.history.undo()).toBe(true);
    const { entries } = await runtime.ops.doc.listTree({ workspaceId: WS });
    expect(entries).toEqual([]);
  });
});
