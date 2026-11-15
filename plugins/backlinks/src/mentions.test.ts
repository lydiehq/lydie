import { describe, expect, test } from "bun:test";

import { findMention, mentionEdit } from "./mentions.ts";

const apply = (md: string, edit: { oldStr: string; newStr: string } | null) =>
  edit ? md.replace(edit.oldStr, edit.newStr) : md;

describe("unlinked mentions", () => {
  test("finds a whole-word mention outside links and code", () => {
    const md = "See [[Roadmap]] and `Roadmap` and roadmaps, then the Roadmap.";
    expect(findMention(md, "Roadmap")).toBe(md.lastIndexOf("Roadmap"));
    expect(findMention("nothing here", "Roadmap")).toBe(-1);
  });

  test("links the mention as written, keeping other bytes", () => {
    const md = "# Notes\n\nWe discussed the roadmap today.\n";
    const edit = mentionEdit(md, "Roadmap");
    expect(apply(md, edit)).toBe("# Notes\n\nWe discussed the [[Roadmap|roadmap]] today.\n");
    expect(mentionEdit("Roadmap first", "Roadmap")?.newStr).toBe("[[Roadmap]]");
  });

  test("grows the context until the edit matches exactly once", () => {
    const md = "Roadmap in [[Roadmap]] then Roadmap again.";
    const edit = mentionEdit(md, "Roadmap")!;
    expect(md.split(edit.oldStr).length - 1).toBe(1);
    expect(apply(md, edit)).toBe("[[Roadmap]] in [[Roadmap]] then Roadmap again.");
  });

  test("returns null when there is nothing to link", () => {
    expect(mentionEdit("Only [[Roadmap]] here", "Roadmap")).toBeNull();
  });
});
