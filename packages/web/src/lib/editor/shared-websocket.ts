import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";

function resolveYjsServerUrl() {
  const explicitUrl = import.meta.env.VITE_YJS_SERVER_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    try {
      const url = new URL(apiUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/yjs";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      // Fall through to localhost default
    }
  }

  return "ws://localhost:3001/yjs";
}

const yjsServerUrl = resolveYjsServerUrl();

let sharedSocket: HocuspocusProviderWebsocket | null = null;

function createSharedSocket() {
  return new HocuspocusProviderWebsocket({ url: yjsServerUrl });
}

export function getSharedWebSocket() {
  if (!sharedSocket) {
    sharedSocket = createSharedSocket();
  }

  return sharedSocket;
}

export function destroySharedWebSocket() {
  if (sharedSocket) {
    sharedSocket.destroy();
    sharedSocket = null;
  }
}
