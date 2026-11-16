// @lydie/sync: the client's cloud sync peer. Node-only helpers are in "@lydie/sync/node".
export { createAttachmentSync, sha256Hex } from "./attachments.ts";
export type {
  AttachmentProgress,
  AttachmentSync,
  AttachmentSyncOptions,
  PutTransport,
  UploadTarget,
} from "./attachments.ts";
export { AbortedError, backoffDelay, createMutex, sleep } from "./backoff.ts";
export type { BackoffOptions } from "./backoff.ts";
export { ACCESS_REVOKED_CODE, createCollab } from "./collab/collab.ts";
export type {
  Collab,
  CollabConnection,
  CollabDocState,
  CollabDocStatus,
  CollabDocument,
  CollabOptions,
  CollabPoolStatus,
  CollabToken,
  CollabUser,
} from "./collab/collab.ts";
export { createIndexedDbYjsPersistence, createMemoryYjsPersistence } from "./collab/persistence.ts";
export type { YjsPersistence } from "./collab/persistence.ts";
export { createConnector } from "./connector.ts";
export type { ConnectorOptions, LydieConnector, SyncToken } from "./connector.ts";
export { deterministicUuid, planHandoff, runHandoff } from "./handoff.ts";
export type {
  HandoffBodies,
  HandoffOptions,
  HandoffPhase,
  HandoffPlan,
  HandoffProgress,
  HandoffResult,
  HandoffSource,
  HandoffSummary,
  HandoffTarget,
} from "./handoff.ts";
export {
  colourFor,
  createHostedBackendParts,
  SignInRequiredError,
  whenServerHas,
} from "./hosted.ts";
export type { HostedParts, HostedPartsOptions } from "./hosted.ts";
export { ApiError, createApiClient, isApiError } from "./http.ts";
export type { ApiClient, ApiClientOptions, ApiErrorKind } from "./http.ts";
export {
  CHECK_TIMEOUT_MS,
  createScopePreference,
  createSession,
  formatScope,
  hostedDatabaseName,
  parseScope,
  readProviderReturn,
  TWO_FACTOR_REQUIRED,
  withoutProviderReturn,
} from "./session.ts";
export type {
  AuthProvider,
  ScopeChoice,
  SecondFactor,
  Session,
  SessionOptions,
  SessionState,
  SessionUser,
  TeamspaceSummary,
  TwoFactorSetup,
  WindowScope,
  WorkspaceSummary,
} from "./session.ts";
export { createHostedSync, deriveStatus, toBackendStatus } from "./sync.ts";
export type {
  BackendStatusShape,
  HostedSync,
  HostedSyncOptions,
  SyncPhase,
  SyncStatus,
} from "./sync.ts";
export type {
  AppliedOperation,
  BlobPort,
  FetchLike,
  KeyValueStorage,
  Observable,
  SecretStorage,
  UserActor,
} from "./types.ts";
export { createUploader, MAX_BATCH, settle } from "./upload.ts";
export type {
  DrainResult,
  OplogPort,
  RejectedChange,
  Uploader,
  UploaderOptions,
  UploadResult,
  UploadWarning,
} from "./upload.ts";
export { ACCOUNT_SERVICE, accountService, toWire } from "./account-service.ts";
export type {
  AccountServiceContract,
  AccountWireState,
  HandoffOutcomeWire,
  SyncWire,
  WindowScopeInfo,
  Wire,
  WireError,
} from "./account-service.ts";
