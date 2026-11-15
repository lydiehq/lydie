// TipTap's Yjs binding and remote carets, in a chunk of their own: only collaborative documents
// (hosted mode) need them, so local windows never load Yjs. `loadCollaboration()` first; the
// React editor waits for it before it builds an editor over a Y.Doc.
export { Collaboration } from "@tiptap/extension-collaboration";
export { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
