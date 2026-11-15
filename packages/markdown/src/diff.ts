// Myers diff and diff3 over token arrays. Written here because general LCS implementations go
// quadratic on Markdown, where thousands of lines are identical (blank lines, `---`, list markers).

export type Hunk = { aStart: number; aEnd: number; bStart: number; bEnd: number };

// Beyond this edit distance the middle is reported as one replaced hunk (bounded time and memory).
const MAX_D = 4000;

function intern(a: readonly string[], b: readonly string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const map = (xs: readonly string[]) => {
    const out = new Int32Array(xs.length);
    for (let i = 0; i < xs.length; i++) {
      let id = ids.get(xs[i]!);
      if (id === undefined) ids.set(xs[i]!, (id = ids.size));
      out[i] = id;
    }
    return out;
  };
  return [map(a), map(b)];
}

// Change hunks turning `a` into `b`, in order.
export function diff(a: readonly string[], b: readonly string[]): Hunk[] {
  const [x, y] = intern(a, b);
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head++;
  let tail = 0;
  while (
    tail < x.length - head &&
    tail < y.length - head &&
    x[x.length - 1 - tail] === y[y.length - 1 - tail]
  )
    tail++;
  const n = x.length - head - tail;
  const m = y.length - head - tail;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0) return [{ aStart: head, aEnd: head + n, bStart: head, bEnd: head + m }];

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, MAX_D); d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let i =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let j = i - k;
      while (i < n && j < m && x[head + i] === y[head + j]) {
        i++;
        j++;
      }
      v[offset + k] = i;
      if (i >= n && j >= m) {
        found = d;
        break;
      }
    }
    if (found !== -1) break;
  }
  if (found === -1) return [{ aStart: head, aEnd: head + n, bStart: head, bEnd: head + m }];

  // Backtrack to an edit script (0 = equal, 1 = delete from a, 2 = insert from b), built in reverse.
  const script: number[] = [];
  let i = n;
  let j = m;
  for (let d = found; d > 0; d--) {
    const vd = trace[d]!; // furthest-reaching values after d - 1 edits; k is at index k + d
    const k = i - j;
    const down = k === -d || (k !== d && vd[k - 1 + d]! < vd[k + 1 + d]!);
    const prevK = down ? k + 1 : k - 1;
    const prevI = vd[prevK + d]!;
    const prevJ = prevI - prevK;
    const editI = down ? prevI : prevI + 1;
    while (i > editI) {
      script.push(0);
      i--;
      j--;
    }
    script.push(down ? 2 : 1);
    i = prevI;
    j = prevJ;
  }
  while (i > 0) {
    script.push(0);
    i--;
  }
  script.reverse();

  const hunks: Hunk[] = [];
  let ai = head;
  let bj = head;
  let open: Hunk | null = null;
  for (const op of script) {
    if (op === 0) {
      if (open) hunks.push(open);
      open = null;
      ai++;
      bj++;
      continue;
    }
    open ??= { aStart: ai, aEnd: ai, bStart: bj, bEnd: bj };
    if (op === 1) open.aEnd = ++ai;
    else open.bEnd = ++bj;
  }
  if (open) hunks.push(open);
  return hunks;
}

export type Region<T> = { ok: T[] } | { conflict: { o: T[]; a: T[]; b: T[] } };

// diff3: merges the changes base→a and base→b. Overlapping or touching changes that differ are
// conflicts; identical changes on both sides are not.
export function diff3(
  o: readonly string[],
  a: readonly string[],
  b: readonly string[],
): Region<string>[] {
  type Side = { side: "a" | "b"; h: Hunk };
  const hunks: Side[] = [
    ...diff(o, a).map((h) => ({ side: "a" as const, h })),
    ...diff(o, b).map((h) => ({ side: "b" as const, h })),
  ].sort((p, q) => p.h.aStart - q.h.aStart || (p.side === "a" ? -1 : 1));
  const out: Region<string>[] = [];
  const pushOk = (xs: readonly string[]) => {
    if (!xs.length) return;
    const last = out[out.length - 1];
    if (last && "ok" in last) last.ok.push(...xs);
    else out.push({ ok: [...xs] });
  };
  let oPos = 0;
  let idx = 0;
  while (idx < hunks.length) {
    const group: Side[] = [hunks[idx]!];
    let start = hunks[idx]!.h.aStart;
    let end = hunks[idx]!.h.aEnd;
    idx++;
    while (idx < hunks.length && hunks[idx]!.h.aStart <= end) {
      const next = hunks[idx]!;
      // Touching changes conflict only across sides.
      if (next.h.aStart === end && group.every((g) => g.side === next.side)) break;
      group.push(next);
      end = Math.max(end, next.h.aEnd);
      start = Math.min(start, next.h.aStart);
      idx++;
    }
    pushOk(o.slice(oPos, start));
    const content = (side: "a" | "b", xs: readonly string[]) => {
      const mine = group.filter((g) => g.side === side).map((g) => g.h);
      if (!mine.length) return o.slice(start, end);
      const first = mine[0]!;
      const last = mine[mine.length - 1]!;
      return xs.slice(first.bStart - (first.aStart - start), last.bEnd + (end - last.aEnd));
    };
    const ac = content("a", a);
    const bc = content("b", b);
    const sides = new Set(group.map((g) => g.side));
    if (sides.size === 1) pushOk(sides.has("a") ? ac : bc);
    else if (ac.length === bc.length && ac.every((t, i) => t === bc[i])) pushOk(ac);
    else out.push({ conflict: { o: o.slice(start, end), a: ac, b: bc } });
    oPos = end;
  }
  pushOk(o.slice(oPos));
  return out;
}
