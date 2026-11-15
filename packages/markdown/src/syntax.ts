// Markdown → mdast for the Lydie dialect: CommonMark + GFM + math + container directives, plus
// micromark constructs for the Obsidian extensions (wikilinks/embeds, ==highlight==, %%comments%%,
// Obsidian-style inline math).
import type { Literal, Parent, PhrasingContent, Root } from "mdast";
import { directiveFromMarkdown } from "mdast-util-directive";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { CompileContext, Extension as FromMarkdownExtension } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { directive } from "micromark-extension-directive";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";
import {
  asciiDigit,
  markdownLineEnding,
  markdownLineEndingOrSpace,
} from "micromark-util-character";
import { splice } from "micromark-util-chunked";
import { classifyCharacter } from "micromark-util-classify-character";
import { resolveAll } from "micromark-util-resolve-all";
import type {
  Code,
  Construct,
  Effects,
  Event,
  Extension,
  State,
  Token,
  TokenizeContext,
} from "micromark-util-types";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    lydieWikiLink: "lydieWikiLink";
    lydieWikiLinkMarker: "lydieWikiLinkMarker";
    lydieWikiLinkData: "lydieWikiLinkData";
    lydieHighlight: "lydieHighlight";
    lydieHighlightText: "lydieHighlightText";
    lydieHighlightSequence: "lydieHighlightSequence";
    lydieHighlightSequenceTemporary: "lydieHighlightSequenceTemporary";
    lydieComment: "lydieComment";
    lydieCommentData: "lydieCommentData";
    lydieCommentFlow: "lydieCommentFlow";
    lydieCommentFlowData: "lydieCommentFlowData";
    lydieMathText: "lydieMathText";
    lydieMathTextData: "lydieMathTextData";
    lydieMathTextSequence: "lydieMathTextSequence";
  }
}

export type WikiLinkNode = Literal & {
  type: "lydieWikiLink";
  // Verbatim text between the brackets.
  value: string;
  embed: boolean;
};
export type HighlightNode = Omit<Parent, "children"> & {
  type: "lydieHighlight";
  children: PhrasingContent[];
};
export type CommentNode = Literal & { type: "lydieComment" };
export type CommentBlockNode = Literal & { type: "lydieCommentBlock" };
export type MathTextNode = Literal & { type: "lydieMathText"; dollars: number };

declare module "mdast" {
  interface PhrasingContentMap {
    lydieWikiLink: WikiLinkNode;
    lydieHighlight: HighlightNode;
    lydieComment: CommentNode;
    lydieMathText: MathTextNode;
  }
  interface RootContentMap {
    lydieWikiLink: WikiLinkNode;
    lydieHighlight: HighlightNode;
    lydieComment: CommentNode;
    lydieMathText: MathTextNode;
    lydieCommentBlock: CommentBlockNode;
  }
  interface BlockContentMap {
    lydieCommentBlock: CommentBlockNode;
  }
}

const DOLLAR = 36;
const PERCENT = 37;
const BANG = 33;
const LBRACKET = 91;
const RBRACKET = 93;
const BACKSLASH = 92;
const EQUALS = 61;
const COLON = 58;

// ---------------------------------------------------------------------------------------------
// [[wikilink]] and ![[embed]]

const wikiLink: Construct = { name: "lydieWikiLink", tokenize: tokenizeWikiLink };

function tokenizeWikiLink(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  let size = 0;
  return start;

  function start(code: Code): State | undefined {
    effects.enter("lydieWikiLink");
    effects.enter("lydieWikiLinkMarker");
    if (code === BANG) {
      effects.consume(code);
      return open1;
    }
    return open1(code);
  }
  function open1(code: Code): State | undefined {
    if (code !== LBRACKET) return nok(code);
    effects.consume(code);
    return open2;
  }
  function open2(code: Code): State | undefined {
    if (code !== LBRACKET) return nok(code);
    effects.consume(code);
    effects.exit("lydieWikiLinkMarker");
    effects.enter("lydieWikiLinkData");
    return inside;
  }
  function inside(code: Code): State | undefined {
    if (code === null || markdownLineEnding(code) || code === LBRACKET) return nok(code);
    if (code === RBRACKET) {
      if (size === 0) return nok(code);
      effects.exit("lydieWikiLinkData");
      effects.enter("lydieWikiLinkMarker");
      effects.consume(code);
      return close;
    }
    size++;
    effects.consume(code);
    return code === BACKSLASH ? escaped : inside;
  }
  function escaped(code: Code): State | undefined {
    if (code === BACKSLASH || code === RBRACKET || code === 124) {
      effects.consume(code);
      return inside;
    }
    return inside(code);
  }
  function close(code: Code): State | undefined {
    if (code !== RBRACKET) return nok(code);
    effects.consume(code);
    effects.exit("lydieWikiLinkMarker");
    effects.exit("lydieWikiLink");
    return ok;
  }
}

// ---------------------------------------------------------------------------------------------
// ==highlight==, modelled on micromark-extension-gfm-strikethrough with exactly two markers.

const highlight: Construct = {
  name: "lydieHighlight",
  tokenize: tokenizeHighlight,
  resolveAll: resolveAllHighlight,
};

function resolveAllHighlight(events: Event[], context: TokenizeContext): Event[] {
  let index = -1;
  while (++index < events.length) {
    const ev = events[index]!;
    if (ev[0] === "enter" && ev[1].type === "lydieHighlightSequenceTemporary" && ev[1]._close) {
      let open = index;
      while (open--) {
        const o = events[open]!;
        if (o[0] === "exit" && o[1].type === "lydieHighlightSequenceTemporary" && o[1]._open) {
          ev[1].type = "lydieHighlightSequence";
          o[1].type = "lydieHighlightSequence";
          const group: Token = {
            type: "lydieHighlight",
            start: { ...o[1].start },
            end: { ...ev[1].end },
          };
          const text: Token = {
            type: "lydieHighlightText",
            start: { ...o[1].end },
            end: { ...ev[1].start },
          };
          const next: Event[] = [
            ["enter", group, context],
            ["enter", o[1], context],
            ["exit", o[1], context],
            ["enter", text, context],
          ];
          const insideSpan = context.parser.constructs.insideSpan.null;
          if (insideSpan) {
            splice(
              next,
              next.length,
              0,
              resolveAll(insideSpan, events.slice(open + 1, index), context),
            );
          }
          splice(next, next.length, 0, [
            ["exit", text, context],
            ["enter", ev[1], context],
            ["exit", ev[1], context],
            ["exit", group, context],
          ]);
          splice(events, open - 1, index - open + 3, next);
          index = open + next.length - 2;
          break;
        }
      }
    }
  }
  for (const ev of events) {
    if (ev[1].type === "lydieHighlightSequenceTemporary") ev[1].type = "data";
  }
  return events;
}

function tokenizeHighlight(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const previous = this.previous;
  const events = this.events;
  let size = 0;
  return start;

  function start(code: Code): State | undefined {
    if (previous === EQUALS && events[events.length - 1]?.[1].type !== "characterEscape") {
      return nok(code);
    }
    effects.enter("lydieHighlightSequenceTemporary");
    return more(code);
  }
  function more(code: Code): State | undefined {
    const before = classifyCharacter(previous);
    if (code === EQUALS) {
      if (size > 1) return nok(code);
      effects.consume(code);
      size++;
      return more;
    }
    if (size < 2) return nok(code);
    const token = effects.exit("lydieHighlightSequenceTemporary");
    const after = classifyCharacter(code);
    token._open = !after || (after === 2 && Boolean(before));
    token._close = !before || (before === 2 && Boolean(after));
    return ok(code);
  }
}

// ---------------------------------------------------------------------------------------------
// %%comment%% inside a paragraph (may span lines).

const commentText: Construct = { name: "lydieComment", tokenize: tokenizeCommentText };

function tokenizeCommentText(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const previous = this.previous;
  return start;

  function start(code: Code): State | undefined {
    if (previous === PERCENT) return nok(code);
    effects.enter("lydieComment");
    effects.enter("lydieWikiLinkMarker");
    effects.consume(code);
    return open2;
  }
  function open2(code: Code): State | undefined {
    if (code !== PERCENT) return nok(code);
    effects.consume(code);
    effects.exit("lydieWikiLinkMarker");
    return between;
  }
  function between(code: Code): State | undefined {
    if (code === null) return nok(code);
    if (markdownLineEnding(code)) {
      effects.enter("lineEnding");
      effects.consume(code);
      effects.exit("lineEnding");
      return between;
    }
    if (code === PERCENT) return effects.attempt(commentClose, done, data)(code);
    return data(code);
  }
  function data(code: Code): State | undefined {
    if (code === null || markdownLineEnding(code)) return between(code);
    if (code === PERCENT) {
      return effects.attempt(commentClose, done, (c) => {
        effects.enter("lydieCommentData");
        effects.consume(c);
        effects.exit("lydieCommentData");
        return between;
      })(code);
    }
    effects.enter("lydieCommentData");
    effects.consume(code);
    return dataMore;
  }
  function dataMore(code: Code): State | undefined {
    if (code === null || markdownLineEnding(code) || code === PERCENT) {
      effects.exit("lydieCommentData");
      return between(code);
    }
    effects.consume(code);
    return dataMore;
  }
  function done(code: Code): State | undefined {
    effects.exit("lydieComment");
    return ok(code);
  }
}

const commentClose: Construct = { partial: true, tokenize: tokenizeCommentClose };

function tokenizeCommentClose(effects: Effects, ok: State, nok: State): State {
  return function (code: Code) {
    effects.enter("lydieWikiLinkMarker");
    effects.consume(code);
    return function (code2: Code) {
      if (code2 !== PERCENT) return nok(code2);
      effects.consume(code2);
      effects.exit("lydieWikiLinkMarker");
      return ok;
    };
  };
}

// ---------------------------------------------------------------------------------------------
// %% block comment %% starting a line, possibly spanning blank lines, closed by a line ending in %%.

const nonLazyContinuation: Construct = { partial: true, tokenize: tokenizeNonLazyContinuation };

function tokenizeNonLazyContinuation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const lazy = this.parser.lazy;
  const now = () => this.now();
  return function (code: Code) {
    if (code === null) return nok(code);
    effects.enter("lineEnding");
    effects.consume(code);
    effects.exit("lineEnding");
    return (c: Code) => (lazy[now().line] ? nok(c) : ok(c));
  };
}

const commentFlow: Construct = {
  name: "lydieCommentFlow",
  tokenize: tokenizeCommentFlow,
  concrete: true,
};

function tokenizeCommentFlow(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const interrupt = this.interrupt;
  let markers = 0;
  let closed = false;
  return start;

  function start(code: Code): State | undefined {
    if (interrupt) return nok(code);
    effects.enter("lydieCommentFlow");
    effects.enter("lydieCommentFlowData");
    effects.consume(code);
    return open2;
  }
  function open2(code: Code): State | undefined {
    if (code !== PERCENT) return nok(code);
    effects.consume(code);
    markers = 0;
    return inside;
  }
  function inside(code: Code): State | undefined {
    if (code === null) {
      if (!closed) return nok(code);
      effects.exit("lydieCommentFlowData");
      return end(code);
    }
    if (markdownLineEnding(code)) {
      effects.exit("lydieCommentFlowData");
      if (closed) return end(code);
      return effects.check(nonLazyContinuation, continuation, nok)(code);
    }
    if (closed) {
      // Text after the closing %% on the same line: this is a paragraph with an inline comment.
      if (code === 32 || code === 9 || code === -2 || code === -1) {
        effects.consume(code);
        return inside;
      }
      return nok(code);
    }
    if (code === PERCENT) {
      markers++;
      effects.consume(code);
      if (markers === 2) {
        closed = true;
        markers = 0;
      }
      return inside;
    }
    markers = 0;
    effects.consume(code);
    return inside;
  }
  function continuation(code: Code): State | undefined {
    effects.enter("lineEnding");
    effects.consume(code);
    effects.exit("lineEnding");
    return lineStart;
  }
  function lineStart(code: Code): State | undefined {
    if (code === null) return nok(code);
    if (markdownLineEnding(code))
      return effects.check(nonLazyContinuation, continuation, nok)(code);
    effects.enter("lydieCommentFlowData");
    return inside(code);
  }
  function end(code: Code): State | undefined {
    effects.exit("lydieCommentFlow");
    return ok(code);
  }
}

// ---------------------------------------------------------------------------------------------
// Inline math with Obsidian's rules: `$x$` (no space after the opener or before the closer, the
// closer not followed by a digit) and `$$x$$` on one line. Block `$$` fences use micromark-extension-math.

const mathText: Construct = { name: "lydieMathText", tokenize: tokenizeMathText };

function tokenizeMathText(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const previous = this.previous;
  let open = 0;
  let lastSpace = false;
  let lastDollar = false;
  // The closing partial needs `open`, so it is created per run.
  const closing: Construct = { partial: true, tokenize: tokenizeClosing };
  return start;

  function start(code: Code): State | undefined {
    if (previous === DOLLAR) return nok(code);
    effects.enter("lydieMathText");
    effects.enter("lydieMathTextSequence");
    return openSeq(code);
  }
  function openSeq(code: Code): State | undefined {
    if (code === DOLLAR) {
      if (open === 2) return nok(code);
      effects.consume(code);
      open++;
      return openSeq;
    }
    effects.exit("lydieMathTextSequence");
    if (code === null || markdownLineEnding(code)) return nok(code);
    if (open === 1 && markdownLineEndingOrSpace(code)) return nok(code);
    effects.enter("lydieMathTextData");
    return inside(code);
  }
  function inside(code: Code): State | undefined {
    if (code === null || markdownLineEnding(code)) return nok(code);
    if (code === DOLLAR && !(open === 1 && (lastSpace || lastDollar))) {
      effects.exit("lydieMathTextData");
      return effects.attempt(closing, after, notClosing)(code);
    }
    lastSpace = markdownLineEndingOrSpace(code);
    lastDollar = code === DOLLAR;
    effects.consume(code);
    return code === BACKSLASH ? escaped : inside;
  }
  function escaped(code: Code): State | undefined {
    if (code === null || markdownLineEnding(code)) return nok(code);
    lastSpace = false;
    effects.consume(code);
    return inside;
  }
  function notClosing(code: Code): State | undefined {
    effects.enter("lydieMathTextData");
    lastSpace = false;
    lastDollar = true;
    effects.consume(code);
    return inside;
  }
  function after(code: Code): State | undefined {
    effects.exit("lydieMathText");
    return ok(code);
  }

  function tokenizeClosing(effects: Effects, ok: State, nok: State): State {
    let size = 0;
    return function seq(code: Code): State | undefined {
      if (code === DOLLAR && size === 0) effects.enter("lydieMathTextSequence");
      if (code === DOLLAR) {
        if (size === open) return nok(code);
        effects.consume(code);
        size++;
        return seq;
      }
      if (size !== open) return nok(code);
      if (open === 1 && asciiDigit(code)) return nok(code);
      effects.exit("lydieMathTextSequence");
      return ok(code);
    };
  }
}

// ---------------------------------------------------------------------------------------------

function lydieSyntax(): Extension {
  return {
    text: {
      [LBRACKET]: wikiLink,
      [BANG]: wikiLink,
      [EQUALS]: highlight,
      [PERCENT]: commentText,
      [DOLLAR]: mathText,
    },
    flow: { [PERCENT]: commentFlow },
    insideSpan: { null: [highlight] },
    attentionMarkers: { null: [EQUALS] },
  };
}

function lydieFromMarkdown(): FromMarkdownExtension {
  return {
    canContainEols: ["lydieHighlight"],
    enter: {
      lydieWikiLink(this: CompileContext, token) {
        this.enter({ type: "lydieWikiLink", value: "", embed: false }, token);
      },
      lydieHighlight(this: CompileContext, token) {
        this.enter({ type: "lydieHighlight", children: [] }, token);
      },
      lydieComment(this: CompileContext, token) {
        this.enter({ type: "lydieComment", value: "" }, token);
      },
      lydieCommentFlow(this: CompileContext, token) {
        this.enter({ type: "lydieCommentBlock", value: "" }, token);
      },
      lydieMathText(this: CompileContext, token) {
        this.enter({ type: "lydieMathText", value: "", dollars: 1 }, token);
      },
    },
    exit: {
      lydieWikiLink(this: CompileContext, token) {
        const node = this.stack[this.stack.length - 1] as WikiLinkNode;
        const raw = this.sliceSerialize(token);
        node.embed = raw.startsWith("!");
        node.value = raw.slice(node.embed ? 3 : 2, -2);
        this.exit(token);
      },
      lydieHighlight(this: CompileContext, token) {
        this.exit(token);
      },
      lydieComment(this: CompileContext, token) {
        const node = this.stack[this.stack.length - 1] as CommentNode;
        node.value = this.sliceSerialize(token);
        this.exit(token);
      },
      lydieCommentFlow(this: CompileContext, token) {
        const node = this.stack[this.stack.length - 1] as CommentBlockNode;
        node.value = this.sliceSerialize(token);
        this.exit(token);
      },
      lydieMathText(this: CompileContext, token) {
        const node = this.stack[this.stack.length - 1] as MathTextNode;
        const raw = this.sliceSerialize(token);
        const dollars = raw.startsWith("$$") ? 2 : 1;
        node.dollars = dollars;
        node.value = raw.slice(dollars, -dollars);
        this.exit(token);
      },
    },
  };
}

const directiveSyntax = directive();
const mathSyntax = math();

// Only `:::name` container directives. Leaf (`::name`) and text (`:name`) directives would turn
// ordinary prose such as "Note:this" into syntax, so they are not part of the dialect.
const containerDirectiveOnly: Extension = {
  flow: { [COLON]: [(directiveSyntax.flow![COLON] as Construct[])[0]!] },
};
const mathFlowOnly: Extension = { flow: { [DOLLAR]: mathSyntax.flow![DOLLAR]! } };

// GFM literal autolinks (`www.x.com`, `https://…`, `a@b.co`) are tried at the start of almost every
// word, and their mdast transform walks the whole tree. A document that cannot contain one skips
// them: same output, about a third less parse time on prose. Each kind needs its letters (or "@")
// in the source; ASCII letters have no named character references, so only a numeric reference
// (`&#…`) could spell them indirectly, and then nothing is skipped. ("@" is also `&commat;`.)
// The GFM table construct is likewise tried at the start of every line. A table needs a literal
// "|" (character references never delimit cells) or, with one column, a delimiter row with an
// alignment colon next to a dash (`:--`, `--:`); documents with neither skip it.
type AutolinkKinds = { email: boolean; www: boolean; protocol: boolean; table?: boolean };

export function autolinkKinds(markdown: string): AutolinkKinds {
  const table = markdown.includes("|") || markdown.includes(":-") || markdown.includes("-:");
  if (markdown.includes("&#")) return { email: true, www: true, protocol: true, table };
  return {
    email: markdown.includes("@") || markdown.includes("&commat;"),
    www: /www/i.test(markdown),
    protocol: /http/i.test(markdown),
    table,
  };
}

const AUTOLINK_CONSTRUCTS = {
  email: "emailAutolink",
  www: "wwwAutolink",
  protocol: "protocolAutolink",
};

// `extension` without the named text and flow constructs (other constructs keep their order).
function withoutConstructs(extension: Extension, names: ReadonlySet<string>): Extension {
  if (names.size === 0) return extension;
  const filter = (map: Extension["text"]): Extension["text"] => {
    if (!map) return map;
    const out: Record<string, Construct | Construct[]> = {};
    for (const [code, value] of Object.entries(map)) {
      const list = (Array.isArray(value) ? value : [value]) as Construct[];
      const kept = list.filter((c) => !c.name || !names.has(c.name));
      if (kept.length === 0) continue;
      out[code] = Array.isArray(value) ? kept : kept[0]!;
    }
    return out as Extension["text"];
  };
  return {
    ...extension,
    ...(extension.text ? { text: filter(extension.text) } : {}),
    ...(extension.flow ? { flow: filter(extension.flow) as Extension["flow"] } : {}),
  };
}

const gfmSyntax = gfm({ singleTilde: false });
const gfmMdast = gfmFromMarkdown();

type Parser = { extensions: Extension[]; mdastExtensions: FromMarkdownExtension[] };
const parsers = new Map<string, Parser>();

function parserFor(kinds: AutolinkKinds): Parser {
  const table = kinds.table ?? true;
  const key = `${+kinds.email}${+kinds.www}${+kinds.protocol}${+table}`;
  let parser = parsers.get(key);
  if (parser) return parser;
  const skipped = new Set(
    (Object.keys(AUTOLINK_CONSTRUCTS) as (keyof typeof AUTOLINK_CONSTRUCTS)[])
      .filter((k) => !kinds[k])
      .map((k) => AUTOLINK_CONSTRUCTS[k]),
  );
  if (!table) skipped.add("table");
  const none = !kinds.email && !kinds.www && !kinds.protocol;
  parser = {
    extensions: [
      withoutConstructs(gfmSyntax, skipped),
      mathFlowOnly,
      containerDirectiveOnly,
      // Last, so its constructs run before the defaults for the same characters.
      lydieSyntax(),
    ],
    mdastExtensions: [
      // The literal-autolink transform finds only http(s)://, www., mailto:/xmpp: and emails.
      ...(none
        ? // The autolink extension is the one handling `literalAutolink` tokens (not its
          // function name, which a minifier renames).
          (gfmMdast as FromMarkdownExtension[]).map(({ transforms, ...rest }) =>
            rest.enter && "literalAutolink" in rest.enter
              ? rest
              : { ...rest, ...(transforms ? { transforms } : {}) },
          )
        : (gfmMdast as FromMarkdownExtension[])),
      mathFromMarkdown(),
      directiveFromMarkdown(),
      lydieFromMarkdown(),
    ],
  };
  parsers.set(key, parser);
  return parser;
}

// Parses Markdown (without frontmatter) into mdast with source positions.
// `kinds`: which literal autolinks to look for (tests pass all of them to compare).
export function parseMdast(markdown: string, kinds = autolinkKinds(markdown)): Root {
  return fromMarkdown(markdown, parserFor(kinds));
}
