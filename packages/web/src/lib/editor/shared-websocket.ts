import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";

/**
 * Shared WebSocket connection for multiplexing multiple Hocuspocus providers.
 * This allows multiple documents to share a single WebSocket connection,
 * significantly reducing resource usage when working with tabs.
 */
let sharedSocket: HocuspocusProviderWebsocket | null = null;

/**
 * Get or create the shared WebSocket connection.
 * @param url The WebSocket server URL
 * @returns The shared WebSocket provider instance
 */
export function getSharedWebSocket(url: string): HocuspocusProviderWebsocket {
  if (!sharedSocket) {
    console.log(`[SharedWebSocket] 🌐 Creating new shared WebSocket connection to: ${url}`);
    sharedSocket = new HocuspocusProviderWebsocket({ url });
    
    // Add event listeners for debugging
    sharedSocket.on("connect", () => {
      console.log("[SharedWebSocket] ✅ WebSocket connected");
    });
    
    sharedSocket.on("disconnect", ({ event }: { event: CloseEvent }) => {
      console.log(`[SharedWebSocket] ⚠️  WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
    });
    
    sharedSocket.on("close", ({ event }: { event: CloseEvent }) => {
      console.log(`[SharedWebSocket] 🔌 WebSocket closed (code: ${event.code})`);
    });
  } else {
    console.log("[SharedWebSocket] ♻️  Reusing existing shared WebSocket connection");
  }
  return sharedSocket;
}

/**
 * Destroy the shared WebSocket connection.
 * Should only be called when the app is shutting down.
 */
export function destroySharedWebSocket(): void {
  if (sharedSocket) {
    console.log("[SharedWebSocket] 🧹 Destroying shared WebSocket");
    sharedSocket.destroy();
    sharedSocket = null;
  }
}
