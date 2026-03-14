import { useEffect } from "react";

import {
  acquireSharedWebSocket,
  releaseSharedWebSocket,
} from "@/lib/editor/shared-websocket";

export function useWorkspaceWebSocket() {
  useEffect(() => {
    acquireSharedWebSocket();

    return () => {
      releaseSharedWebSocket();
    };
  }, []);
}
