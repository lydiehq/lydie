// Mapping disk steps to the editor's document when main based them on an older update (LYD-269).
import { describe, expect, test } from "bun:test";

import { getLydieSchema, Mapping, Step } from "@lydie/plugin-api/editor";

import { SessionLog } from "./session-log.ts";

const schema = getLydieSchema();
const doc = (text: string) =>
  schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
// Inserting `text` at `pos` (positions inside the paragraph start at 1).
const insert = (pos: number, text: string) =>
  Step.fromJSON(schema, {
    stepType: "replace",
    from: pos,
    to: pos,
    slice: { content: [{ type: "text", text }] },
  });
const mappingOf = (...steps: Step[]) => {
  const m = new Mapping();
  for (const s of steps) m.appendMap(s.getMap());
  return m;
};

describe("session log", () => {
  test("steps based on an older update map through every edit since it", () => {
    // Opened "abc"; update 1 sent; then the editor typed "X" at the start and sent update 2.
    const log = new SessionLog();
    log.update(1);
    const typed = insert(1, "X");
    log.local(mappingOf(typed));
    log.update(2);
    // Main's steps against update 1 ("abc"): append "!" at the end (pos 4).
    const remote = insert(4, "!");
    const mapped = remote.map(log.since(1))!;
    const editorDoc = typed.apply(doc("abc")).doc!;
    expect(mapped.apply(editorDoc).doc!.textContent).toBe("Xabc!");
    // Based on update 2 instead, there is nothing to map through.
    expect(insert(5, "!").map(log.since(2))!.apply(editorDoc).doc!.textContent).toBe("Xabc!");
  });

  test("main's own earlier steps are undone before the editor's edits are redone", () => {
    const log = new SessionLog();
    log.update(1);
    // Main sent "1" at the start (based on 1); the editor applied it, then typed "Y" at the end.
    const first = insert(1, "1");
    log.remote([first], mappingOf(first));
    const typed = insert(5, "Y");
    log.local(mappingOf(typed));
    // Main's next steps are relative to update 1 with its first step applied: "1abc" → "1ab2c".
    const second = insert(4, "2");
    const editorDoc = typed.apply(first.apply(doc("abc")).doc!).doc!;
    expect(editorDoc.textContent).toBe("1abcY");
    expect(second.map(log.since(1))!.apply(editorDoc).doc!.textContent).toBe("1ab2cY");
  });

  test("pruning keeps what later steps can still be based on", () => {
    const log = new SessionLog();
    log.update(1);
    log.local(mappingOf(insert(1, "X")));
    const setSeq = log.update(-1);
    setSeq(2);
    log.prune(2);
    expect(log.hasLocal()).toBe(false);
    expect(log.since(2).maps.length).toBe(0);
  });

  test("a save main took as current drops what came before it", () => {
    const log = new SessionLog();
    for (let seq = 1; seq <= 50; seq++) {
      log.local(mappingOf(insert(1, "x")));
      log.update(seq);
    }
    log.local(mappingOf(insert(1, "y")));
    const setSeq = log.update(-1);
    setSeq(51);
    log.saved(51);
    expect(log.hasLocal()).toBe(false);
    // Typing after the save is all that steps based on it map through.
    log.local(mappingOf(insert(1, "z")));
    expect(log.since(51).maps.length).toBe(1);
  });
});
