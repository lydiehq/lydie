import { HocuspocusProvider } from "@hocuspocus/provider";
import { base64ToUint8Array } from "@lydie/core/lib/base64";
import * as Y from "yjs";

import { getSharedWebSocket } from "./shared-websocket";

const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001/yjs";

interface DocumentConnection {
  provider: HocuspocusProvider;
  ydoc: Y.Doc;
  documentId: string;
  initialState: string | null;
}

class DocumentConnectionManager {
  private connections = new Map<string, DocumentConnection>();

  /**
   * Get or create a connection for a document.
   * If the connection exists, it will be reused and marked as active.
   */
  getConnection(documentId: string, initialYjsState: string | null): DocumentConnection {
    const existing = this.connections.get(documentId);

    if (existing) {
      return existing;
    }

    // Create new connection
    const ydoc = new Y.Doc();

    // Apply initial state if available
    if (initialYjsState) {
      const bytes = base64ToUint8Array(initialYjsState);
      Y.applyUpdate(ydoc, bytes);
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
      documentId,
      initialState: initialYjsState,
    };

    this.connections.set(documentId, connection);

    return connection;
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
    // Clean up all connections
    for (const [, connection] of this.connections) {
      connection.provider.destroy();
      connection.ydoc.destroy();
    }
    this.connections.clear();
  }

  /**
   * Get debug info about active connections.
   */
  getDebugInfo() {
    return Array.from(this.connections.entries()).map(([id]) => ({
      documentId: id,
    }));
  }
}

// Singleton instance
export const documentConnectionManager = new DocumentConnectionManager();

// Export types
export type { DocumentConnection };
