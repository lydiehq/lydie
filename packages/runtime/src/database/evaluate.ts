// Evaluates Obsidian Bases expressions (the subset @lydie/contract parses) over one row. Used for
// formula columns and for filter statements Lydie does not model as conditions.
import { refOf } from "@lydie/contract";
import type { Expr, PropertyRef } from "@lydie/contract";

export class DateValue {
  constructor(
    readonly ms: number,
    // false: a calendar date (no time of day).
    readonly time: boolean,
  ) {}
  toString(): string {
    const iso = new Date(this.ms).toISOString();
    return this.time ? iso : iso.slice(0, 10);
  }
}

export class LinkValue {
  constructor(
    readonly id: string,
    readonly title: string,
  ) {}
  toString(): string {
    return this.title;
  }
}

export type Value =
  | string
  | number
  | boolean
  | null
  | DateValue
  | LinkValue
  | Value[]
  | { [key: string]: Value };

export class EvalError extends Error {}

export type Scope = {
  // note.x / bare x
  note(name: string): Value;
  // file.name, file.ctime, file.mtime, file.path, file.folder, file.tags, file.properties
  file(name: string): Value;
  formula(name: string): Value;
  now: number;
  today: string;
};

const DURATION =
  /^\s*(-?\d+(?:\.\d+)?)\s*(y|years?|M|months?|d|days?|w|weeks?|h|hours?|m|minutes?|s|seconds?)\s*$/;

export function parseDate(text: string): DateValue | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?/.exec(
      text.trim(),
    );
  if (!m) return null;
  if (!m[4]) return new DateValue(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!), false);
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${m[7] ? `.${m[7]}` : ""}${m[8] ?? "Z"}`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new DateValue(ms, true);
}

export function addDuration(date: DateValue, text: string, sign: 1 | -1): DateValue {
  const m = DURATION.exec(text);
  if (!m) throw new EvalError(`Invalid duration "${text}"`);
  const n = Number(m[1]) * sign;
  const unit = m[2]!;
  const d = new Date(date.ms);
  if (unit === "y" || unit.startsWith("year")) d.setUTCFullYear(d.getUTCFullYear() + n);
  else if (unit === "M" || unit.startsWith("month")) d.setUTCMonth(d.getUTCMonth() + n);
  else {
    const ms =
      unit === "d" || unit.startsWith("day")
        ? 86_400_000
        : unit === "w" || unit.startsWith("week")
          ? 7 * 86_400_000
          : unit === "h" || unit.startsWith("hour")
            ? 3_600_000
            : unit === "m" || unit.startsWith("minute")
              ? 60_000
              : 1000;
    return new DateValue(date.ms + n * ms, date.time || ms < 86_400_000);
  }
  return new DateValue(d.getTime(), date.time);
}

export function isEmptyValue(v: Value | undefined): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object" && !(v instanceof DateValue) && !(v instanceof LinkValue)) {
    return Object.keys(v).length === 0;
  }
  return false;
}

export function truthy(v: Value): boolean {
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v !== "";
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== false;
}

export function equals(a: Value, b: Value): boolean {
  if (a instanceof DateValue && b instanceof DateValue) return a.ms === b.ms;
  if (a instanceof LinkValue)
    return b instanceof LinkValue ? a.id === b.id : a.id === b || a.title === b;
  if (b instanceof LinkValue) return equals(b, a);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => equals(x, b[i]!));
  }
  return a === b;
}

export function compare(a: Value, b: Value): number {
  if (a instanceof DateValue && b instanceof DateValue) return a.ms - b.ms;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = toText(a);
  const y = toText(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function toText(v: Value): string {
  if (v === null) return "";
  if (Array.isArray(v)) return v.map(toText).join(", ");
  if (typeof v === "object" && !(v instanceof DateValue) && !(v instanceof LinkValue)) {
    return JSON.stringify(v);
  }
  return String(v);
}

// JSON-safe form of a value, for query results.
export function toJson(v: Value): unknown {
  if (v instanceof DateValue) return v.toString();
  if (v instanceof LinkValue) return { id: v.id, title: v.title };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

const asNumber = (v: Value): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  throw new EvalError("Expected a number");
};

const asList = (v: Value): Value[] => (Array.isArray(v) ? v : isEmptyValue(v) ? [] : [v]);

function arithmetic(op: string, a: Value, b: Value): Value {
  if (op === "+" && a instanceof DateValue && typeof b === "string") return addDuration(a, b, 1);
  if (op === "-" && a instanceof DateValue && typeof b === "string") return addDuration(a, b, -1);
  if (op === "-" && a instanceof DateValue && b instanceof DateValue) return a.ms - b.ms;
  if (op === "+" && (typeof a === "string" || typeof b === "string")) return toText(a) + toText(b);
  if (a === null || b === null) return null;
  const x = asNumber(a);
  const y = asNumber(b);
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "*":
      return x * y;
    case "/":
      return y === 0 ? null : x / y;
    default:
      return y === 0 ? null : x % y;
  }
}

type Locals = Record<string, Value>;

export function evaluate(e: Expr, scope: Scope, locals: Locals = {}): Value {
  const localNames = new Set(Object.keys(locals));
  const ref = refOf(e, localNames);
  if (ref) return readRef(ref, scope);
  switch (e.kind) {
    case "literal":
      return e.value;
    case "ident":
      if (e.name in locals) return locals[e.name]!;
      throw new EvalError(`Unknown name "${e.name}"`);
    case "list":
      return e.items.map((i) => evaluate(i, scope, locals));
    case "unary": {
      const v = evaluate(e.arg, scope, locals);
      return e.op === "!" ? !truthy(v) : v === null ? null : -asNumber(v);
    }
    case "binary": {
      if (e.op === "&&") {
        const l = evaluate(e.left, scope, locals);
        return truthy(l) ? truthy(evaluate(e.right, scope, locals)) : false;
      }
      if (e.op === "||") {
        const l = evaluate(e.left, scope, locals);
        return truthy(l) ? true : truthy(evaluate(e.right, scope, locals));
      }
      const l = evaluate(e.left, scope, locals);
      const r = evaluate(e.right, scope, locals);
      switch (e.op) {
        case "==":
          return equals(l, r);
        case "!=":
          return !equals(l, r);
        case "<":
        case "<=":
        case ">":
        case ">=": {
          if (l === null || r === null) return false;
          const c = compare(l, r);
          return e.op === "<" ? c < 0 : e.op === "<=" ? c <= 0 : e.op === ">" ? c > 0 : c >= 0;
        }
        default:
          return arithmetic(e.op, l, r);
      }
    }
    case "index": {
      const o = evaluate(e.object, scope, locals);
      const i = evaluate(e.index, scope, locals);
      if (Array.isArray(o) && typeof i === "number") return o[i < 0 ? o.length + i : i] ?? null;
      if (o && typeof o === "object" && typeof i === "string" && !Array.isArray(o)) {
        return (o as Record<string, Value>)[i] ?? null;
      }
      return null;
    }
    case "member":
      return member(evaluate(e.object, scope, locals), e.property);
    case "call":
      return call(e, scope, locals);
  }
}

function readRef(ref: PropertyRef, scope: Scope): Value {
  if (ref.ns === "note") return scope.note(ref.name);
  if (ref.ns === "file") return scope.file(ref.name);
  return scope.formula(ref.name);
}

function member(o: Value, name: string): Value {
  if (o instanceof DateValue) {
    const d = new Date(o.ms);
    const fields: Record<string, number> = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      millisecond: d.getUTCMilliseconds(),
    };
    if (name in fields) return fields[name]!;
  }
  if (name === "length" && (typeof o === "string" || Array.isArray(o))) return o.length;
  if (
    o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    !(o instanceof DateValue) &&
    !(o instanceof LinkValue)
  ) {
    return (o as Record<string, Value>)[name] ?? null;
  }
  return null;
}

const GLOBAL = new Set([
  "if",
  "date",
  "now",
  "today",
  "number",
  "list",
  "min",
  "max",
  "link",
  "duration",
]);

function call(e: Extract<Expr, { kind: "call" }>, scope: Scope, locals: Locals): Value {
  const args = () => e.args.map((a) => evaluate(a, scope, locals));
  if (e.callee.kind === "ident" && GLOBAL.has(e.callee.name) && !(e.callee.name in locals)) {
    switch (e.callee.name) {
      case "if": {
        const [c, a, b] = e.args;
        if (!c || !a) throw new EvalError("if() needs a condition and a value");
        return truthy(evaluate(c, scope, locals))
          ? evaluate(a, scope, locals)
          : b
            ? evaluate(b, scope, locals)
            : null;
      }
      case "now":
        return new DateValue(scope.now, true);
      case "today":
        return parseDate(scope.today);
      case "date": {
        const [v] = args();
        if (v instanceof DateValue) return v;
        return typeof v === "string" ? parseDate(v) : null;
      }
      case "number": {
        const [v] = args();
        if (v instanceof DateValue) return v.ms;
        try {
          return v === null || v === undefined ? null : asNumber(v);
        } catch {
          return null;
        }
      }
      case "list": {
        const [v] = args();
        return asList(v ?? null);
      }
      case "min":
      case "max": {
        const ns = args()
          .filter((v) => v !== null)
          .map(asNumber);
        if (ns.length === 0) return null;
        return e.callee.name === "min" ? Math.min(...ns) : Math.max(...ns);
      }
      case "link": {
        const [v, display] = args();
        if (v instanceof LinkValue) return v;
        return new LinkValue(
          toText(v ?? null),
          display === undefined || display === null ? toText(v ?? null) : toText(display),
        );
      }
      case "duration": {
        const [v] = args();
        return typeof v === "string" ? addDuration(new DateValue(0, true), v, 1).ms : null;
      }
    }
  }
  if (e.callee.kind !== "member") throw new EvalError("Unknown function");
  const name = e.callee.property;
  const target = evaluate(e.callee.object, scope, locals);
  // map / filter / reduce evaluate their argument per item.
  if (Array.isArray(target) && (name === "map" || name === "filter" || name === "reduce")) {
    const body = e.args[0];
    if (!body) throw new EvalError(`${name}() needs an expression`);
    if (name === "reduce") {
      let acc = e.args[1] ? evaluate(e.args[1], scope, locals) : null;
      target.forEach((value, index) => {
        acc = evaluate(body, scope, { ...locals, value, index, acc });
      });
      return acc;
    }
    const out: Value[] = [];
    target.forEach((value, index) => {
      const r = evaluate(body, scope, { ...locals, value, index });
      if (name === "map") out.push(r);
      else if (truthy(r)) out.push(value);
    });
    return out;
  }
  return method(target, name, args());
}

function method(t: Value, name: string, a: Value[]): Value {
  const str = (i: number) => toText(a[i] ?? null);
  if (name === "isEmpty") return isEmptyValue(t);
  if (name === "isTruthy") return truthy(t);
  if (name === "toString") return toText(t);
  if (name === "isType") {
    const type = Array.isArray(t)
      ? "list"
      : t instanceof DateValue
        ? "date"
        : t instanceof LinkValue
          ? "link"
          : t === null
            ? "null"
            : typeof t;
    return type === str(0);
  }
  if (t instanceof DateValue) {
    if (name === "date")
      return new DateValue(
        Date.UTC(
          new Date(t.ms).getUTCFullYear(),
          new Date(t.ms).getUTCMonth(),
          new Date(t.ms).getUTCDate(),
        ),
        false,
      );
    if (name === "time") return new Date(t.ms).toISOString().slice(11, 19);
    if (name === "format") return formatDate(t, str(0));
    throw new EvalError(`Unknown date function ${name}()`);
  }
  if (t instanceof LinkValue) {
    if (name === "asFile") return { name: t.title, basename: t.title };
    throw new EvalError(`Unknown link function ${name}()`);
  }
  if (Array.isArray(t)) {
    switch (name) {
      case "contains":
        return t.some((x) => equals(x, a[0] ?? null));
      case "containsAll":
        return a.every((v) => t.some((x) => equals(x, v)));
      case "containsAny":
        return a.some((v) => t.some((x) => equals(x, v)));
      case "join":
        return t.map(toText).join(str(0));
      case "reverse":
        return [...t].reverse();
      case "slice":
        return t.slice(
          a[0] === undefined ? 0 : asNumber(a[0]),
          a[1] === undefined ? undefined : asNumber(a[1]),
        );
      case "sort":
        return [...t].sort(compare);
      case "unique":
        return t.filter((x, i) => t.findIndex((y) => equals(x, y)) === i);
      case "flat":
        return t.flat() as Value[];
      default:
        throw new EvalError(`Unknown list function ${name}()`);
    }
  }
  if (typeof t === "number") {
    switch (name) {
      case "abs":
        return Math.abs(t);
      case "ceil":
        return Math.ceil(t);
      case "floor":
        return Math.floor(t);
      case "round": {
        const digits = a[0] === undefined ? 0 : asNumber(a[0]);
        const f = 10 ** digits;
        return Math.round(t * f) / f;
      }
      case "toFixed":
        return t.toFixed(a[0] === undefined ? 0 : asNumber(a[0]));
      default:
        throw new EvalError(`Unknown number function ${name}()`);
    }
  }
  if (typeof t === "string" || t === null) {
    const s = t ?? "";
    switch (name) {
      case "contains":
        return s.includes(str(0));
      case "containsAll":
        return a.every((v) => s.includes(toText(v)));
      case "containsAny":
        return a.some((v) => s.includes(toText(v)));
      case "startsWith":
        return s.startsWith(str(0));
      case "endsWith":
        return s.endsWith(str(0));
      case "lower":
        return s.toLowerCase();
      case "upper":
        return s.toUpperCase();
      case "title":
        return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
      case "trim":
        return s.trim();
      case "replace":
        return s.split(str(0)).join(str(1));
      case "repeat":
        return s.repeat(Math.max(0, asNumber(a[0] ?? 0)));
      case "reverse":
        // Code points, not grapheme clusters: what Obsidian does too.
        return Array.from(s).reverse().join("");
      case "slice":
        return s.slice(
          a[0] === undefined ? 0 : asNumber(a[0]),
          a[1] === undefined ? undefined : asNumber(a[1]),
        );
      case "split": {
        const parts = s.split(str(0));
        return a[1] === undefined ? parts : parts.slice(0, asNumber(a[1]));
      }
      default:
        throw new EvalError(`Unknown text function ${name}()`);
    }
  }
  if (typeof t === "object" && t !== null) {
    if (name === "keys") return Object.keys(t);
    if (name === "values") return Object.values(t);
  }
  throw new EvalError(`Unknown function ${name}()`);
}

function formatDate(d: DateValue, format: string): string {
  const date = new Date(d.ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const parts: Record<string, string> = {
    YYYY: String(date.getUTCFullYear()),
    MM: pad(date.getUTCMonth() + 1),
    DD: pad(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => parts[token]!);
}
