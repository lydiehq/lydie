// `@lydie/app/backend`: Backend implementations and their transport. Free of React, DOM and Node
// imports, so the Electron main process can import it to serve the renderer.
export { createEventHub, createLocalBackend, opsProxy } from "./local.ts";
export type { EventHub, LocalBackend, LocalBackendOptions } from "./local.ts";
export { createRemoteBackend, applyLiveEvent, fromWireError } from "./remote.ts";
export { createVaultDocuments } from "./vault-documents.ts";
export { encodeRows, serveBackend, toWireError } from "./serve.ts";
export { backendService } from "./service.ts";
export type { BackendContract, LiveEvent, Result, RowSegment, WireError } from "./service.ts";
export { createLiveRegistry, liveKey, stabilize, frameScheduler } from "./live-registry.ts";
export type { LiveRegistry, LiveSource } from "./live-registry.ts";
export { MARKDOWN_EXTRACT_VERSION, markdownExtract, reextractIfStale } from "./extract.ts";
export { handledOperations } from "./registry.ts";
