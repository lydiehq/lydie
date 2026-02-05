import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import { getSharedWebSocket } from "./shared-websocket";

const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001/yjs";

// Time before an inactive document provider is destroyed (3 minutes)
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;

interface DocumentConnection {
  provider: HocuspocusProvider;
  ydoc: Y.Doc;
  lastAccessed: number;
  documentId: string;
  initialState: string | null;
}

class DocumentConnectionManager {
  private connections = new Map<string, DocumentConnection>();
  private reapInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start the reaper interval to clean up idle connections
    this.reapInterval = setInterval(() => this.reapIdleConnections(), 60000); // Check every minute
  }

  /**
   * Get or create a connection for a document.
   * If the connection exists, it will be reused and marked as active.
   */
  getConnection(documentId: string, initialYjsState: string | null): DocumentConnection {
    const existing = this.connections.get(documentId);

    if (existing) {
      // Update last accessed time
      existing.lastAccessed = Date.now();
      return existing;
    }

    // Create new connection
    const ydoc = new Y.Doc();

    // Apply initial state if available
    if (initialYjsState) {
      try {
        const bytes = Buffer.from(initialYjsState, "base64");
        Y.applyUpdate(ydoc, new Uint8Array(bytes));
      } catch {
        // Silently fail - document will be empty but collaboration will still work
      }
    }

    const sharedSocket = getSharedWebSocket(yjsServerUrl);

    const provider = new HocuspocusProvider({
      websocketProvider: sharedSocket,
      name: documentId,
      document: ydoc,
      token: "auth-token",
    });

    provider.attach();

    const connection: DocumentConnection = {
      provider,
      ydoc,
      lastAccessed: Date.now(),
      documentId,
      initialState: initialYjsState,
    };

    this.connections.set(documentId, connection);

    return connection;
  }

  /**
   * Mark a document as still in use.
   * Call this periodically while the document is open to prevent it from being reaped.
   */
  keepAlive(documentId: string) {
    const connection = this.connections.get(documentId);
    if (connection) {
      connection.lastAccessed = Date.now();
    }
  }

  /**
   * Force immediate cleanup of a document connection.
   */
  cleanup(documentId: string) {
    const connection = this.connections.get(documentId);
    if (!connection) return;

    connection.provider.destroy();
    connection.ydoc.destroy();
    this.connections.delete(documentId);
  }

  /**
   * Destroy all connections and clean up.
   */
  destroy() {
    if (this.reapInterval) {
      clearInterval(this.reapInterval);
      this.reapInterval = null;
    }

    // Clean up all connections
    for (const [, connection] of this.connections) {
      connection.provider.destroy();
      connection.ydoc.destroy();
    }
    this.connections.clear();
  }

  /**
   * Clean up connections that haven't been accessed recently.
   */
  private reapIdleConnections() {
    const now = Date.now();

    for (const [documentId, connection] of this.connections) {
      if (now - connection.lastAccessed > IDLE_TIMEOUT_MS) {
        connection.provider.destroy();
        connection.ydoc.destroy();
        this.connections.delete(documentId);
      }
    }
  }

  /**
   * Get debug info about active connections.
   */
  getDebugInfo() {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      documentId: id,
      lastAccessed: new Date(conn.lastAccessed).toISOString(),
      idleMs: Date.now() - conn.lastAccessed,
    }));
  }
}

// Singleton instance
export const documentConnectionManager = new DocumentConnectionManager();

// Export types
export type { DocumentConnection };
