// What only a hosted workspace or the hand-off needs: the sync engine, collab, Yjs and the Markdown
// extractor (all of @lydie/markdown). Imported dynamically, so the main process does not evaluate
// it before its first window (`@lydie/sync` and `@lydie/app` are side-effect free: what hosted.ts
// imports from them statically does not pull these in).
export { markdownExtract } from "@lydie/app/backend";
export { createHostedBackendParts, planHandoff, runHandoff } from "@lydie/sync";
