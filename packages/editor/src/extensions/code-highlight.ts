// Code block highlighting with lowlight, in place of TipTap's plugin. TipTap's highlights every code
// block in the document again whenever the caret is in one, and guesses the language of each
// unlabelled block with highlightAuto (every grammar in turn): typing in a document with many code
// blocks took hundreds of milliseconds per key. Here only the code blocks a transaction touches are
// highlighted again, results are cached by language and text, and an unlabelled block's language is
// guessed once and again only when typing pauses.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createLowlight } from "lowlight";

import { changedTextblocks } from "./changed-ranges";

// v1 loaded every highlight.js grammar (`all`, ~190 languages); `common` (~37) covers what people
// write in notes at a fraction of the weight. Unknown languages keep their name and stay plain.
// The grammars are their own chunk, fetched once an editor shows a code block or the browser is
// idle; code blocks painted before they arrive are highlighted again then.
export const lowlight = createLowlight();

let grammarsLoaded = false;
let grammarsLoading: Promise<void> | undefined;
const grammarListeners = new Set<() => void>();

export function loadGrammars(): Promise<void> {
  grammarsLoading ??= import("./grammars")
    .then(({ grammars }) => {
      lowlight.register(grammars);
      grammarsLoaded = true;
      for (const listener of [...grammarListeners]) listener();
    })
    .catch(() => {});
  return grammarsLoading;
}

// For useSyncExternalStore: the language list changes once, when the grammars load.
export function subscribeGrammars(listener: () => void) {
  grammarListeners.add(listener);
  return () => grammarListeners.delete(listener);
}
export const grammarsVersion = () => grammarsLoaded;

// [start, end, class names] of each highlighted run, as offsets into the block's text.
type Token = readonly [number, number, string];
type Highlight = { language: string | undefined; tokens: readonly Token[] };
type HastNode = {
  type: string;
  value?: string;
  children?: HastNode[];
  properties?: { className?: unknown };
};

function tokensOf(root: { children: unknown[] }): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  const walk = (nodes: readonly HastNode[], classes: readonly string[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        const end = at + (node.value?.length ?? 0);
        if (classes.length && end > at) tokens.push([at, end, classes.join(" ")]);
        at = end;
      } else if (node.children) {
        const own = node.properties?.className;
        walk(node.children, Array.isArray(own) ? [...classes, ...own.map(String)] : classes);
      }
    }
  };
  walk(root.children as HastNode[], []);
  return tokens;
}

// Shared by every editor; big enough that a document replaced whole (a collaborator's change
// arrives that way) finds all its blocks here.
const CACHE_SIZE = 2000;
const cache = new Map<string, Highlight>();

function cached(key: string, compute: () => Highlight): Highlight {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = compute();
  cache.set(key, value);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return value;
}

const PLAIN: Highlight = { language: undefined, tokens: [] };

function highlight(language: string, text: string): Highlight {
  if (!grammarsLoaded || !lowlight.registered(language)) return PLAIN;
  return cached(`${language}\n${text}`, () => ({
    language,
    tokens: tokensOf(lowlight.highlight(language, text)),
  }));
}

// highlightAuto tries every grammar: run per block when it is first seen and when typing pauses,
// never per key.
function detect(text: string): Highlight {
  if (!grammarsLoaded) return PLAIN;
  return cached(`\n${text}`, () => {
    const root = lowlight.highlightAuto(text);
    return { language: root.data?.language, tokens: tokensOf(root) };
  });
}

// What is remembered of a code block between transactions (the spec of a node decoration that is
// never drawn). `guess` is set for an unlabelled block: the language guessed for it, and whether
// its text changed since.
type BlockSpec = { codeBlock: true; guess?: { language: string | undefined; stale: boolean } };

export type CodeHighlightState = {
  decorations: DecorationSet;
  blocks: DecorationSet;
  // Some unlabelled block has changed since its language was guessed.
  stale: boolean;
};

export const codeHighlightKey = new PluginKey<CodeHighlightState>("codeHighlight");

type Built = { decorations: Decoration[]; block: Decoration };

// `previous` is what was remembered of the block before it was edited: an unlabelled block keeps
// the language guessed then until typing pauses. Without it (a new block, a language removed) the
// language is guessed now.
function buildBlock(node: ProseMirrorNode, pos: number, previous: BlockSpec | undefined): Built {
  const text = node.textContent;
  const language = node.attrs.language as string | null;
  let result: Highlight;
  let spec: BlockSpec;
  if (language) {
    result = highlight(language, text);
    spec = { codeBlock: true };
  } else if (previous?.guess) {
    const guessed = previous.guess.language;
    result = guessed ? highlight(guessed, text) : PLAIN;
    spec = { codeBlock: true, guess: { language: guessed, stale: true } };
  } else {
    result = detect(text);
    spec = { codeBlock: true, guess: { language: result.language, stale: false } };
  }
  const start = pos + 1;
  return {
    decorations: result.tokens.map(([from, to, className]) =>
      Decoration.inline(start + from, start + to, { class: className }),
    ),
    block: Decoration.node(pos, pos + node.nodeSize, {}, spec),
  };
}

export function buildCodeHighlight(doc: ProseMirrorNode, name: string): CodeHighlightState {
  const decorations: Decoration[] = [];
  const blocks: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === name) {
      const built = buildBlock(node, pos, undefined);
      decorations.push(...built.decorations);
      blocks.push(built.block);
    }
    return !node.isTextblock;
  });
  return {
    decorations: DecorationSet.create(doc, decorations),
    blocks: DecorationSet.create(doc, blocks),
    stale: false,
  };
}

function blockEntries(blocks: DecorationSet, from: number, to: number) {
  return blocks.find(from, to).filter((d) => d.from >= from && d.to <= to);
}

// The textblocks a transaction touched lose their highlighting, and the code blocks among them are
// highlighted again. Everything else is only mapped.
export function applyCodeHighlight(
  tr: Transaction,
  value: CodeHighlightState,
  name: string,
): CodeHighlightState {
  const doc = tr.doc;
  let decorations = value.decorations.map(tr.mapping, doc);
  let blocks = value.blocks.map(tr.mapping, doc);
  const removeDecorations: Decoration[] = [];
  const removeBlocks: Decoration[] = [];
  const addDecorations: Decoration[] = [];
  const addBlocks: Decoration[] = [];
  for (const { node, pos } of changedTextblocks(tr)) {
    const end = pos + node.nodeSize;
    removeDecorations.push(...decorations.find(pos + 1, end - 1));
    const entries = blockEntries(blocks, pos, end);
    removeBlocks.push(...entries);
    if (node.type.name !== name) continue;
    const previous = (entries.find((d) => d.from === pos) ?? entries[0])?.spec as
      | BlockSpec
      | undefined;
    const built = buildBlock(node, pos, previous);
    addDecorations.push(...built.decorations);
    addBlocks.push(built.block);
  }
  // In document order, as changedTextblocks gives them: DecorationSet#add walks the document once
  // and drops node decorations that come out of order.
  if (removeDecorations.length) decorations = decorations.remove(removeDecorations);
  if (addDecorations.length) decorations = decorations.add(doc, addDecorations);
  if (removeBlocks.length) blocks = blocks.remove(removeBlocks);
  if (addBlocks.length) blocks = blocks.add(doc, addBlocks);
  const stale = value.stale || addBlocks.some((d) => (d.spec as BlockSpec).guess?.stale === true);
  return { decorations, blocks, stale };
}

// Guesses the language of every unlabelled block edited since the last guess.
function guessAgain(state: EditorState, value: CodeHighlightState): CodeHighlightState {
  const stale = value.blocks.find(
    undefined,
    undefined,
    (spec) => (spec as BlockSpec).guess?.stale === true,
  );
  let { decorations, blocks } = value;
  for (const entry of stale) {
    const node = state.doc.nodeAt(entry.from);
    if (!node) continue;
    const built = buildBlock(node, entry.from, undefined);
    decorations = decorations
      .remove(decorations.find(entry.from + 1, entry.to - 1))
      .add(state.doc, built.decorations);
    blocks = blocks.remove([entry]).add(state.doc, [built.block]);
  }
  return { decorations, blocks, stale: false };
}

// How long typing must pause before an edited unlabelled block's language is guessed again.
export const GUESS_DELAY = 500;

const idle = (fn: () => void) =>
  (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback?.(fn) ??
  setTimeout(fn, 1000);

export function codeHighlightPlugin(name: string) {
  return new Plugin<CodeHighlightState>({
    key: codeHighlightKey,
    state: {
      init: (_, { doc }) => buildCodeHighlight(doc, name),
      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(codeHighlightKey) as "grammars" | "guess" | undefined;
        if (meta === "grammars") return buildCodeHighlight(newState.doc, name);
        if (meta === "guess") return guessAgain(newState, value);
        if (!tr.docChanged) return value;
        return applyCodeHighlight(tr, value, name);
      },
    },
    props: { decorations: (state) => codeHighlightKey.getState(state)?.decorations },
    view(view) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = grammarsLoaded
        ? undefined
        : subscribeGrammars(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(codeHighlightKey, "grammars"));
          });
      const hasCode = (state: EditorState) =>
        codeHighlightKey.getState(state)!.blocks.find().length > 0;
      if (!grammarsLoaded) {
        if (hasCode(view.state)) void loadGrammars();
        else idle(() => void loadGrammars());
      }
      return {
        update(view, prevState) {
          const value = codeHighlightKey.getState(view.state)!;
          if (value === codeHighlightKey.getState(prevState)) return;
          if (!grammarsLoaded && hasCode(view.state)) void loadGrammars();
          if (!value.stale) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(codeHighlightKey, "guess"));
          }, GUESS_DELAY);
        },
        destroy() {
          clearTimeout(timer);
          off?.();
        },
      };
    },
  });
}
