import { describe, expect, test } from "bun:test";

import { Fragment, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { Transform } from "prosemirror-transform";

import { plainText } from "./extract";
import { merge3 } from "./merge";
import { fingerprint, normalizeForMarkdown } from "./normalize";
import { parse } from "./parse";
import { reconcile } from "./reconcile";
import type { ReplaceStepJSON } from "./reconcile";
import { schema } from "./schema";

function apply(doc: Node, steps: ReplaceStepJSON[]): Node {
  const tr = new Transform(doc);
  for (const s of steps) tr.replace(s.from, s.to, Slice.fromJSON(schema, s.slice));
  return tr.doc;
}

const same = (a: Node, b: Node) =>
  fingerprint(normalizeForMarkdown(a)) === fingerprint(normalizeForMarkdown(b));

function replaceText(doc: Node, index: number, from: string, to: string): Node {
  const children: Node[] = [];
  doc.forEach((c) => children.push(c));
  const json = JSON.stringify(children[index]!.toJSON()).replace(new RegExp(`\\b${from}\\b`), to);
  children[index] = schema.nodeFromJSON(JSON.parse(json));
  return doc.type.create(null, Fragment.fromArray(children));
}

describe("merge3", () => {
  test("edits to different lines merge", () => {
    expect(merge3("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n")).toEqual({
      clean: true,
      text: "A\nb\nC\n",
    });
  });
  test("edits to different words of one line merge", () => {
    expect(merge3("the quick fox\n", "the slow fox\n", "the quick dog\n")).toEqual({
      clean: true,
      text: "the slow dog\n",
    });
  });
  test("same word edited both sides is a conflict", () => {
    const r = merge3("x y\n", "x a\n", "x b\n");
    expect(r.clean).toBe(false);
    if (!r.clean) {
      expect(r.conflicts).toEqual([{ base: "x y\n", ours: "x a\n", theirs: "x b\n" }]);
      expect(r.marked).toBe("<<<<<<< editor\nx a\n=======\nx b\n>>>>>>> disk\n");
    }
  });
});

describe("reconcile", () => {
  test("disk edit to another block becomes a narrow step; editor edit kept", () => {
    const base = "# Title\n\nalpha beta\n\ngamma delta\n";
    const disk = "# Title\n\nalpha beta\n\ngamma DELTA\n";
    const editor = replaceText(parse(base).doc, 1, "alpha", "ALPHA");
    const r = reconcile({ base, disk, doc: editor });
    expect(r.status).toBe("clean");
    if (r.status !== "clean") return;
    expect(r.source).toBe("# Title\n\nALPHA beta\n\ngamma DELTA\n");
    expect(r.steps).toHaveLength(1);
    // Only the changed word's range inside the third block is replaced.
    const step = r.steps[0]!;
    expect(step.to - step.from).toBe(5);
    expect(same(apply(editor, r.steps), r.parse.doc)).toBe(true);
  });

  test("no change on disk gives no steps", () => {
    const base = "a\n\nb\n";
    const editor = replaceText(parse(base).doc, 0, '"a"', '"x"');
    const r = reconcile({ base, disk: base, doc: editor });
    expect(r.status === "clean" && r.steps).toEqual([]);
  });

  test("conflicts surface as text conflicts", () => {
    const base = "one two\n";
    const editor = replaceText(parse(base).doc, 0, "two", "EDITOR");
    const r = reconcile({ base, disk: "one DISK\n", doc: editor });
    expect(r.status).toBe("conflict");
  });
});

// S2 pass signal: randomized concurrent edits, no lost edits.
describe("reconcile fuzz", () => {
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }

  type Block = { kind: "p" | "h" | "list" | "quote" | "code"; words: string[] };
  function render(b: Block): string {
    const w = b.words.join(" ");
    switch (b.kind) {
      case "h":
        return `## ${w}`;
      case "list":
        return b.words.map((x) => `- ${x}`).join("\n");
      case "quote":
        return `> ${w}`;
      case "code":
        return "```\n" + w + "\n```";
      default:
        return w;
    }
  }

  test("1000 random concurrent edit pairs", () => {
    const random = rng(42);
    const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)]!;
    let clean = 0;
    let conflicts = 0;
    for (let iter = 0; iter < 1000; iter++) {
      let uid = 0;
      const n = 3 + Math.floor(random() * 8);
      const blocks: Block[] = Array.from({ length: n }, (_, i) => ({
        kind: pick(["p", "p", "p", "h", "list", "quote", "code"] as const),
        words: Array.from({ length: 2 + Math.floor(random() * 4) }, () => `w${i}x${uid++}`),
      }));
      const base = blocks.map(render).join("\n\n") + "\n";

      // Disk: text-level edits.
      const diskBlocks = blocks.map((b) => ({ ...b, words: [...b.words] }));
      const expectPresent: string[] = [];
      const deleted = new Set<string>();
      const diskTouched = new Set<number>();
      const diskOps = 1 + Math.floor(random() * 3);
      for (let k = 0; k < diskOps; k++) {
        const i = Math.floor(random() * n);
        diskTouched.add(i);
        const op = random();
        if (op < 0.6) {
          const j = Math.floor(random() * diskBlocks[i]!.words.length);
          if (!diskBlocks[i]!.words[j]!.startsWith("w")) continue;
          deleted.add(diskBlocks[i]!.words[j]!);
          diskBlocks[i]!.words[j] = `D${iter}x${k}`;
          expectPresent.push(`D${iter}x${k}`);
        } else if (op < 0.85) {
          diskBlocks.splice(i + 1, 0, { kind: "p", words: [`Dnew${iter}x${k}`] });
          expectPresent.push(`Dnew${iter}x${k}`);
          break;
        } else {
          for (const w of diskBlocks[i]!.words) {
            const at = expectPresent.indexOf(w);
            if (at === -1) deleted.add(w);
            else expectPresent.splice(at, 1);
          }
          diskBlocks.splice(i, 1);
          break;
        }
      }
      const disk = diskBlocks.map(render).join("\n\n") + "\n";

      // Editor: document-level edits.
      let doc = parse(base).doc;
      const editorOps = 1 + Math.floor(random() * 3);
      for (let k = 0; k < editorOps; k++) {
        const i = Math.floor(random() * doc.childCount);
        const op = random();
        if (op < 0.7) {
          const words = plainText(doc.child(i))
            .split(/\s+/)
            .filter((w) => /^w\d+x\d+$/.test(w));
          const w = words.length ? pick(words) : null;
          if (!w) continue;
          deleted.add(w);
          doc = replaceText(doc, i, w, `E${iter}x${k}`);
          expectPresent.push(`E${iter}x${k}`);
        } else {
          const children: Node[] = [];
          doc.forEach((c) => children.push(c));
          children.splice(
            i,
            0,
            schema.nodes.paragraph.create(null, schema.text(`Enew${iter}x${k}`)),
          );
          doc = doc.type.create(null, Fragment.fromArray(children));
          expectPresent.push(`Enew${iter}x${k}`);
        }
      }

      const r = reconcile({ base, disk, doc });
      if (r.status === "conflict") {
        conflicts++;
        // Nothing is dropped silently: every edit is in the conflict output.
        for (const m of expectPresent) {
          if (!(r.marked.includes(m) || r.ours.includes(m) || disk.includes(m))) {
            throw new Error(
              `iteration ${iter}: ${m} missing\nbase:\n${base}\ndisk:\n${disk}\nours:\n${r.ours}\nmarked:\n${r.marked}`,
            );
          }
        }
        expect(r.conflicts.length).toBeGreaterThan(0);
        continue;
      }
      clean++;
      const text = plainText(r.parse.doc);
      for (const m of expectPresent) {
        if (!text.includes(m))
          throw new Error(
            `iteration ${iter}: lost edit ${m}\nbase:\n${base}\ndisk:\n${disk}\nmerged:\n${r.source}`,
          );
      }
      for (const w of deleted) {
        if (new RegExp(`\\b${w}\\b`).test(text))
          throw new Error(`iteration ${iter}: deleted word ${w} came back\n${r.source}`);
      }
      // The steps turn the editor's document into the merged one.
      expect(same(apply(doc, r.steps), r.parse.doc)).toBe(true);
    }
    console.log(`reconcile fuzz: ${clean} clean merges, ${conflicts} conflicts, 0 lost edits`);
    expect(clean).toBeGreaterThan(500);
  });
});
