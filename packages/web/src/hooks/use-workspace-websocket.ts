import { useEffect } from "react";

import { getSharedWebSocket } from "@/lib/editor/shared-websocket";

const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL || "ws://localhost:3001/yjs";

export function useWorkspaceWebSocket() {
  useEffect(() => {
    // Pre-warm the connection when entering workspace
    getSharedWebSocket(yjsServerUrl);
  }, []);
}
