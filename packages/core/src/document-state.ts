/**
 * Registry for document state accessors.
 * This allows the backend to register the Hocuspocus document accessor,
 * which the core package can then use to read real-time document state.
 */

export type DocumentStateAccessor = (documentId: string) => Uint8Array | null;

let hocuspocusAccessor: DocumentStateAccessor | null = null;

/**
 * Register the Hocuspocus document state accessor.
 * This should be called by the backend on startup.
 */
export function registerHocuspocusAccessor(accessor: DocumentStateAccessor): void {
  hocuspocusAccessor = accessor;
}

/**
 * Get the current document state from Hocuspocus if available.
 * Returns null if the document is not loaded in memory or if no accessor is registered.
 */
export function getHocuspocusDocumentState(documentId: string): Uint8Array | null {
  if (!hocuspocusAccessor) {
    return null;
  }

  return hocuspocusAccessor(documentId);
}

/**
 * Check if the Hocuspocus accessor is available.
 */
export function isHocuspocusAvailable(): boolean {
  return hocuspocusAccessor !== null;
}
