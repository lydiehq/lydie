import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";

let sharedSocket: HocuspocusProviderWebsocket | null = null;

export function getSharedWebSocket(url: string): HocuspocusProviderWebsocket {
  if (!sharedSocket) {
    sharedSocket = new HocuspocusProviderWebsocket({ url });
  }
  return sharedSocket;
}

export function destroySharedWebSocket(): void {
  if (sharedSocket) {
    sharedSocket.destroy();
    sharedSocket = null;
  }
}
