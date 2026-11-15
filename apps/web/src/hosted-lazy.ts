// Hosted-only code: the sync engine, the collab pool, the hand-off and Yjs. Imported dynamically
// where a window opens a hosted workspace or runs the hand-off, so local windows never load it.
// (`@lydie/sync` is side-effect free: what the startup imports from it does not pull these in.)
export {
  colourFor,
  createCollab,
  createHostedBackendParts,
  createIndexedDbYjsPersistence,
  planHandoff,
  runHandoff,
  SignInRequiredError,
} from "@lydie/sync";
export { markdownToYjs } from "./to-yjs.ts";
