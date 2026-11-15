// KaTeX and its stylesheet, imported only through `loadKatex()` so both land in their own chunk:
// documents without math never fetch them.
// A reference, not a tsconfig entry: packages that typecheck this source through their own
// tsconfig must see the declaration too.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./stylesheet.d.ts" />
import katex from "katex";
import "katex/dist/katex.min.css";

export default katex;
