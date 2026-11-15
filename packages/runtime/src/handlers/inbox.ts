import type { Document, Operations } from "@lydie/contract";

import type { Handlers } from "../runtime.ts";

// One capture appended to the inbox: a list item (after `time` when given), extra lines indented.
export function captureLine(text: string, time?: string): string {
  const lines = text.trim().split(/\r?\n/);
  const first = `- ${time ? `${time} ` : ""}${lines[0] ?? ""}`;
  return [first, ...lines.slice(1).map((line) => `  ${line}`)].join("\n");
}

// `body` with `line` appended after a blank line, or straight onto a list it ends with.
export function appendTo(body: string, line: string): string {
  if (!body.trim()) return `${line}\n`;
  const trimmed = body.replace(/\s+$/, "");
  const lastLine = trimmed.split("\n").at(-1) ?? "";
  const separator = /^\s*[-*+] /.test(lastLine) ? "\n" : "\n\n";
  return `${trimmed}${separator}${line}\n`;
}

export const inboxHandlers: Handlers<Operations> = {
  // Composite: its steps (doc.create, doc.updateBody) are logged and replayed on their own, with
  // the ids minted here, so a hosted replay lands in the same pages.
  async "inbox.capture"(ctx, input) {
    const name = input.inbox.toLowerCase();
    const topLevel = await ctx.tx.docs.children(input.workspaceId, null, {
      includeDeleted: false,
    });
    let inbox = topLevel.find((doc) => doc.title.trim().toLowerCase() === name);
    inbox ??= (await ctx.exec("doc.create", {
      workspaceId: input.workspaceId,
      parentId: null,
      title: input.inbox,
    })) as Document;

    if (input.title) {
      const page = (await ctx.exec("doc.create", {
        workspaceId: input.workspaceId,
        parentId: inbox.id,
        title: input.title,
        markdown: input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`,
        ...(input.url ? { properties: { source: input.url } } : {}),
      })) as Document;
      return { inboxId: inbox.id, documentId: page.id, created: true };
    }

    const text = input.url ? `${input.markdown} ${input.url}` : input.markdown;
    const body = (await ctx.tx.bodies.get(inbox.id))?.markdown ?? "";
    await ctx.exec("doc.updateBody", {
      id: inbox.id,
      markdown: appendTo(body, captureLine(text, input.time)),
    });
    return { inboxId: inbox.id, documentId: inbox.id, created: false };
  },
};
