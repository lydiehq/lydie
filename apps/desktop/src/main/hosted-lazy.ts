// What only a hosted workspace or the hand-off needs: the sync engine, collab and Yjs. Imported
// dynamically, so the main process does not evaluate it before its first window (`@lydie/sync`
// is side-effect free: what hosted.ts imports from it statically does not pull these in).
export { createHostedBackendParts, planHandoff, runHandoff } from "@lydie/sync";
