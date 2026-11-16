# AGENTS.md - @lydie/markdown

Lydie Markdown ⇄ ProseMirror, splice-preserving save, three-way (LCA) reconciliation, index
extraction, and the fidelity corpus. Runs headless (Node, Electron main, browser, workers).
The dialect and every mapping decision are in `SPEC.md`.

Licence: MIT.

## May depend on

Nothing internal. `client/scripts/check-boundaries.ts` is authoritative and runs in CI. External:
micromark/mdast-util-* (parsing), `prosemirror-model`, `yaml`.

## Rules

- No DOM or Node APIs in `src/` (tests and `scripts/` may use them).
- Untouched bytes are never rewritten. Any change must keep `bun run test` (100% no-op identity on
  all corpora) and `bun run test:corpus` green.
- The schema is a contract with `@lydie/editor`; `src/schema.test.ts` pins it. Change both together
  and update `SPEC.md` "Schema contract".
- `fixtures/` is byte-exact test data (CRLF, BOM, tabs): `.gitattributes` disables line-ending
  conversion and `.oxfmtrc.json` keeps `bun fmt` out of it. Never reformat it.

## Public API (`src/index.ts`)

```ts
schema: Schema                                   // nodes/marks: SPEC.md "Schema contract"
parse(source): ParseResult                       // { source, doc, properties, frontmatter, body: Span, eol, fallbacks };
                                                 // shared with later parses of the same text: never mutate it
serialize(doc, properties?, { eol? }): string    // canonical Markdown for a new file
save({ original: ParseResult | string, doc, properties? }): { source, verified, parse }
                                                 // parse: of `source` (the verification's), the next save's original
reconcile({ base: ParseResult | string, disk, doc, properties? }):
  | { status: "clean", source, parse, steps: ReplaceStepJSON[], properties }
  | { status: "conflict", conflicts: TextConflict[], marked, ours }
merge3(base, ours, theirs): MergeResult          // the text merge reconcile uses
extract(source): Extracted                       // links, blocks, headings, tags, blockIds, text, properties
rewriteLinks(source, link => newTarget | undefined): string
assignBlockId(source, blockIndex, id?): { source, id }
importDoc(docOrJson): Node                       // editor doc (TipTap schema or JSON) → this schema;
                                                 // the editor's callout folds open/closed become +/-
normalizeForMarkdown(doc): Node                  // what the doc reads back as after save
plainText(node): string
columnShares(widths): number[]                   // each column's share of its row (percent; null widths share the rest);
                                                 // also `@lydie/markdown/columns`, without the parser (the editor's import)
```

`doc` arguments accept a ProseMirror node from any schema with the Lydie names, or its JSON;
unknown attributes (e.g. UniqueID) are ignored, unknown node types throw.

## For the file bridge

- Decode files keeping the BOM (`new TextDecoder("utf-8", { ignoreBOM: true })`); offsets are
  UTF-16 indexes into that string. Do not open files that are not valid UTF-8.
- Keep the `ParseResult` of the last agreed text (LCA) per open file. Save with
  `save({ original: lcaParse, doc })` (its `parse` is the written text's, the next LCA); on a disk change call `reconcile({ base: lcaParse, disk, doc })`,
  apply `steps` in order (`tr.replace(from, to, Slice.fromJSON(schema, slice))`), write `source` if it
  differs from disk, and make it the new LCA. On `"conflict"`, show `conflicts` and keep the LCA.
- `save` throws if properties are edited while the frontmatter is invalid YAML.
- Empty paragraphs are not saved (Markdown cannot hold them).

## Tests and tools

```bash
bun --filter=@lydie/markdown run test          # unit + spec/OFM corpus + reconcile fuzz (~1.5 s)
bun --filter=@lydie/markdown run fetch-corpus  # download the Obsidian help vault into .cache/
bun --filter=@lydie/markdown run test:corpus   # help vault (skips with a message if absent, ~1 min)
bun scripts/fidelity-report.ts [--only=gfm] [--verbose] [--no-edits] [--vault-filter=en/]
bun --filter=@lydie/markdown run bench         # parse/save/reconcile timings
```

## Performance notes

- `parseMdast` leaves out constructs a document cannot contain, with the same output (checked by
  `src/syntax.test.ts` against the full parser on every fixture, tricky inputs and the help vault):
  - **GFM literal autolinks:** email needs "@" or `&commat;`, www needs "www", URLs need "http";
    any `&#` keeps all of them. Without any of the three, the mdast autolink transform is skipped too.
  - **GFM tables:** need "|", or ":-"/"-:" for a one-column table.
- Both are tried at nearly every word or line start, which is what made prose slow to parse.
- **Parse cache** (`parseWithTree`): the last 6 texts of 1 KB or more, with their mdast trees. A
  save's verification parses its output, and that text is parsed again right after (the index's
  `extract`, the next save's `original`, the bridge's LCA): those are hits. A file with frontmatter
  (or a BOM) also leaves its body, `source.slice(body.from)`, which is what a document stores and
  the index extracts: the same tree, converted when first asked for (not when the body itself
  starts with a BOM or frontmatter; `parse.test.ts` checks it against a fresh parse). Note with
  frontmatter, save + extract of the body: 105 → 52 ms. `save` keeps the
  normalised original per parsed document (a `WeakMap`), and verifies block by block, so the next
  save from the result fingerprints only the edited document. Seed document, one edit: save +
  extract 99 → 57 ms, no-op save 4.9 → 0.5 ms. The save itself is one full parse; verifying only
  the changed blocks would not save it, since the same text is parsed in full right after anyway.
- Seed document (2,000 blocks, 205 KB): parse 77 → 46 ms, first (cold) parse 102 → 67 ms. Help vault:
  parse all 13.0 → 9.0 s. `bun run bench` (package) or `bun run bench:markdown` (client root).
