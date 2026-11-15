// The subset of the Obsidian Bases expression language Lydie reads and writes, for formulas and
// filters (help.obsidian.md/bases/syntax, /bases/functions). Parsing and printing only; the
// evaluator is in @lydie/runtime and the SQL compiler in @lydie/store.
//
// Supported: number, string ('…' or "…"), true/false/null literals; list literals [a, b];
// identifiers and property references (`price`, `note.price`, `note["a b"]`, `file.name`,
// `formula.x`); member access, indexing and method calls; unary ! and -; the binary operators
// * / % + - < <= > >= == != && ||. Not supported: regular expression literals.

export type Literal = { kind: "literal"; value: string | number | boolean | null };
export type Ident = { kind: "ident"; name: string };
export type Member = { kind: "member"; object: Expr; property: string };
export type Index = { kind: "index"; object: Expr; index: Expr };
export type Call = { kind: "call"; callee: Expr; args: Expr[] };
export type Unary = { kind: "unary"; op: "!" | "-"; arg: Expr };
export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "&&"
  | "||";
export type Binary = { kind: "binary"; op: BinaryOp; left: Expr; right: Expr };
export type ListExpr = { kind: "list"; items: Expr[] };
export type Expr = Literal | Ident | Member | Index | Call | Unary | Binary | ListExpr;

export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { t: "num"; v: number; at: number; raw: string }
  | { t: "str"; v: string; at: number }
  | { t: "id"; v: string; at: number }
  | { t: "op"; v: string; at: number }
  | { t: "end"; at: number };

const OPERATORS = [
  "==",
  "!=",
  ">=",
  "<=",
  "&&",
  "||",
  "(",
  ")",
  "[",
  "]",
  ",",
  ".",
  "!",
  "+",
  "-",
  "*",
  "/",
  "%",
  ">",
  "<",
];

function lex(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i))!;
      out.push({ t: "num", v: Number(m[0]), at: i, raw: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = "";
      for (; j < source.length && source[j] !== c; j++) {
        if (source[j] === "\\" && j + 1 < source.length) {
          const next = source[++j]!;
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
        } else value += source[j];
      }
      if (j >= source.length) throw new ExpressionError("Unterminated string", i);
      out.push({ t: "str", v: value, at: i });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(c)) {
      const m = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(source.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) throw new ExpressionError(`Unexpected "${c}"`, i);
    out.push({ t: "op", v: op, at: i });
    i += op.length;
  }
  out.push({ t: "end", at: source.length });
  return out;
}

const BINARY: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

export function parseExpression(source: string): Expr {
  const tokens = lex(source);
  let p = 0;
  const peek = () => tokens[p]!;
  const isOp = (v: string) => {
    const t = peek();
    return t.t === "op" && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`Expected "${v}"`, peek().at);
    p++;
  };

  function primary(): Expr {
    const t = peek();
    if (t.t === "num") {
      p++;
      return { kind: "literal", value: t.v };
    }
    if (t.t === "str") {
      p++;
      return { kind: "literal", value: t.v };
    }
    if (t.t === "id") {
      p++;
      if (t.v === "true" || t.v === "false") return { kind: "literal", value: t.v === "true" };
      if (t.v === "null") return { kind: "literal", value: null };
      return { kind: "ident", name: t.v };
    }
    if (isOp("(")) {
      p++;
      const e = binary(0);
      expect(")");
      return e;
    }
    if (isOp("[")) {
      p++;
      const items: Expr[] = [];
      while (!isOp("]")) {
        items.push(binary(0));
        if (!isOp("]")) expect(",");
      }
      p++;
      return { kind: "list", items };
    }
    throw new ExpressionError(
      t.t === "end" ? "Unexpected end of expression" : "Unexpected token",
      t.at,
    );
  }

  function postfix(): Expr {
    let e = primary();
    for (;;) {
      if (isOp(".")) {
        p++;
        const t = peek();
        if (t.t !== "id") throw new ExpressionError("Expected a name after '.'", t.at);
        p++;
        e = { kind: "member", object: e, property: t.v };
      } else if (isOp("[")) {
        p++;
        const index = binary(0);
        expect("]");
        e = { kind: "index", object: e, index };
      } else if (isOp("(")) {
        p++;
        const args: Expr[] = [];
        while (!isOp(")")) {
          args.push(binary(0));
          if (!isOp(")")) expect(",");
        }
        p++;
        e = { kind: "call", callee: e, args };
      } else return e;
    }
  }

  function unary(): Expr {
    if (isOp("!") || isOp("-")) {
      const op = (peek() as { v: "!" | "-" }).v;
      p++;
      const arg = unary();
      if (op === "-" && arg.kind === "literal" && typeof arg.value === "number") {
        return { kind: "literal", value: -arg.value };
      }
      return { kind: "unary", op, arg };
    }
    return postfix();
  }

  function binary(min: number): Expr {
    let left = unary();
    for (;;) {
      const t = peek();
      const prec = t.t === "op" ? BINARY[t.v] : undefined;
      if (prec === undefined || prec <= min) return left;
      p++;
      const right = binary(prec);
      left = { kind: "binary", op: (t as { v: BinaryOp }).v, left, right };
    }
  }

  const e = binary(0);
  if (peek().t !== "end") throw new ExpressionError("Unexpected token", peek().at);
  return e;
}

export function tryParseExpression(source: string): Expr | null {
  try {
    return parseExpression(source);
  } catch {
    return null;
  }
}

// ---- Printing (canonical form: double quotes, minimal parentheses)

const IDENT = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

export function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function precedence(e: Expr): number {
  if (e.kind === "binary") return BINARY[e.op]!;
  if (e.kind === "unary") return 7;
  if (e.kind === "literal" && typeof e.value === "number" && e.value < 0) return 7;
  return 8;
}

export function printExpression(e: Expr): string {
  const wrap = (child: Expr, min: number) => {
    const s = printExpression(child);
    return precedence(child) < min ? `(${s})` : s;
  };
  switch (e.kind) {
    case "literal":
      if (typeof e.value === "string") return quote(e.value);
      return String(e.value);
    case "ident":
      return e.name;
    case "member":
      return `${wrap(e.object, 8)}.${e.property}`;
    case "index":
      return `${wrap(e.object, 8)}[${printExpression(e.index)}]`;
    case "call":
      return `${wrap(e.callee, 8)}(${e.args.map(printExpression).join(", ")})`;
    case "list":
      return `[${e.items.map(printExpression).join(", ")}]`;
    case "unary":
      return `${e.op}${wrap(e.arg, 7)}`;
    case "binary": {
      const p = BINARY[e.op]!;
      // Left-associative: the right side needs parentheses at equal precedence.
      return `${wrap(e.left, p)} ${e.op} ${wrap(e.right, p + 1)}`;
    }
  }
}

// ---- Property references

export type PropertyNamespace = "note" | "file" | "formula";
export type PropertyRef = { ns: PropertyNamespace; name: string };

// `price`, `note.price`, `note["a b"]`, `file.name`, `formula.x`, `formula["a b"]`.
export function refOf(e: Expr, locals: ReadonlySet<string> = new Set()): PropertyRef | null {
  if (e.kind === "ident") {
    if (locals.has(e.name) || ["note", "file", "formula", "this"].includes(e.name)) return null;
    return { ns: "note", name: e.name };
  }
  const base =
    e.kind === "member" || e.kind === "index"
      ? e.object.kind === "ident"
        ? e.object.name
        : null
      : null;
  if (base !== "note" && base !== "file" && base !== "formula") return null;
  if (e.kind === "member") return { ns: base, name: e.property };
  if (e.kind === "index" && e.index.kind === "literal" && typeof e.index.value === "string") {
    return { ns: base, name: e.index.value };
  }
  return null;
}

// `note.price` style string for `order`, `sort`, `groupBy` and `properties:` keys.
export function refString(ref: PropertyRef): string {
  return `${ref.ns}.${ref.name}`;
}

// Parses a property reference as written in `order` / `sort` / `columnSize` keys: `status`
// (= note.status), `note.status`, `file.name`, `formula.Type icon`.
export function parseRefString(value: string): PropertyRef {
  const m = /^(note|file|formula)\.(.+)$/.exec(value.trim());
  if (m) return { ns: m[1] as PropertyNamespace, name: m[2]! };
  return { ns: "note", name: value.trim() };
}

// The expression that reads a property: `status`, `note["a b"]`, `file.name`, `formula.x`.
export function refExpr(ref: PropertyRef): Expr {
  const bare =
    IDENT.test(ref.name) &&
    !["note", "file", "formula", "this", "true", "false", "null"].includes(ref.name);
  if (ref.ns === "note" && bare) return { kind: "ident", name: ref.name };
  if (bare) return { kind: "member", object: { kind: "ident", name: ref.ns }, property: ref.name };
  return {
    kind: "index",
    object: { kind: "ident", name: ref.ns },
    index: { kind: "literal", value: ref.name },
  };
}

// Every property an expression reads (for dependency tracking).
export function refsIn(e: Expr, locals: ReadonlySet<string> = new Set()): PropertyRef[] {
  const out: PropertyRef[] = [];
  const visit = (x: Expr, scope: ReadonlySet<string>) => {
    const ref = refOf(x, scope);
    if (ref) {
      out.push(ref);
      return;
    }
    switch (x.kind) {
      case "member":
        visit(x.object, scope);
        break;
      case "index":
        visit(x.object, scope);
        visit(x.index, scope);
        break;
      case "call": {
        visit(x.callee, scope);
        // map/filter/reduce bodies see `value`, `index` and `acc`.
        const lambda =
          x.callee.kind === "member" && ["map", "filter", "reduce"].includes(x.callee.property);
        const inner = lambda ? new Set([...scope, "value", "index", "acc"]) : scope;
        for (const a of x.args) visit(a, inner);
        break;
      }
      case "unary":
        visit(x.arg, scope);
        break;
      case "binary":
        visit(x.left, scope);
        visit(x.right, scope);
        break;
      case "list":
        for (const i of x.items) visit(i, scope);
        break;
      default:
        break;
    }
  };
  visit(e, locals);
  return out;
}
