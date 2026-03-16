import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";

const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001/yjs";

let sharedSocket: HocuspocusProviderWebsocket | null = null;
let activeConsumers = 0;

function createSharedSocket() {
  sharedSocket = new HocuspocusProviderWebsocket({ url: yjsServerUrl });
  return sharedSocket;
}

function ensureSharedSocket() {
  if (!sharedSocket) {
    return createSharedSocket();
  }

  return sharedSocket;
}

export function acquireSharedWebSocket() {
  activeConsumers += 1;
  return ensureSharedSocket();
}

export function releaseSharedWebSocket() {
  if (activeConsumers > 0) {
    activeConsumers -= 1;
  }

  if (activeConsumers === 0 && sharedSocket) {
    sharedSocket.destroy();
    sharedSocket = null;
  }
}

export function destroySharedWebSocket() {
  activeConsumers = 0;

  if (sharedSocket) {
    sharedSocket.destroy();
    sharedSocket = null;
  }
}
