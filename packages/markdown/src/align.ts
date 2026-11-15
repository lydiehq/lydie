import { diff } from "./diff";

export type AlignOp =
  | { kind: "keep"; a: number; b: number }
  | { kind: "change"; a: number; b: number }
  | { kind: "delete"; a: number }
  | { kind: "insert"; b: number };

// Aligns two block lists by fingerprint. Inside each differing hunk, deleted and inserted blocks
// of the same type are paired in order as "change" (an edit of that block); the rest are pure
// deletions and insertions. Ops come in document order.
export function align(a: string[], b: string[], aType: string[], bType: string[]): AlignOp[] {
  const ops: AlignOp[] = [];
  let i = 0;
  let j = 0;
  for (const hunk of diff(a, b)) {
    const aStart = hunk.aStart;
    const aLen = hunk.aEnd - hunk.aStart;
    const bStart = hunk.bStart;
    const bLen = hunk.bEnd - hunk.bStart;
    while (i < aStart) ops.push({ kind: "keep", a: i++, b: j++ });
    const dels: number[] = [];
    for (let k = 0; k < aLen; k++) dels.push(aStart + k);
    let d = 0;
    for (let k = 0; k < bLen; k++) {
      const bi = bStart + k;
      let q = d;
      while (q < dels.length && aType[dels[q]!] !== bType[bi]) q++;
      if (q < dels.length) {
        while (d < q) ops.push({ kind: "delete", a: dels[d++]! });
        ops.push({ kind: "change", a: dels[q]!, b: bi });
        d = q + 1;
      } else ops.push({ kind: "insert", b: bi });
    }
    while (d < dels.length) ops.push({ kind: "delete", a: dels[d++]! });
    i = aStart + aLen;
    j = bStart + bLen;
  }
  while (i < a.length) ops.push({ kind: "keep", a: i++, b: j++ });
  return ops;
}
