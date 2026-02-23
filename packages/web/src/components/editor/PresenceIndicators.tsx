import { PeopleRegular } from "@fluentui/react-icons";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useState } from "react";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

type ProviderWithWebsocket = HocuspocusProvider & {
  configuration?: {
    websocketProvider?: {
      status?: string;
    };
  };
};

function normalizeConnectionStatus(status: string | undefined): ConnectionStatus {
  if (status === "connected" || status === "connecting" || status === "disconnected") {
    return status;
  }

  return "disconnected";
}

function getConnectionStatusFromProvider(provider: HocuspocusProvider | null): ConnectionStatus {
  const websocketStatus = (provider as ProviderWithWebsocket | null)?.configuration?.websocketProvider
    ?.status;

  return normalizeConnectionStatus(websocketStatus);
}

type AwarenessUser = {
  clientID: number;
  user: {
    name: string;
    color: string;
  };
};

type Props = {
  provider: HocuspocusProvider | null;
};

export function PresenceIndicators({ provider }: Props) {
  const [users, setUsers] = useState<AwarenessUser[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    getConnectionStatusFromProvider(provider),
  );

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) {
      setUsers([]);
      setConnectionStatus(getConnectionStatusFromProvider(provider));
      return;
    }

    const updateUsers = () => {
      const states = Array.from(awareness.getStates().entries());
      const activeUsers = states
        .filter(([clientID, state]) => {
          // Filter out current user and users without user data
          return clientID !== awareness.clientID && state.user && state.user.name;
        })
        .map(([clientID, state]) => ({
          clientID,
          user: state.user as { name: string; color: string },
        }));

      setUsers(activeUsers);
    };

    const handleStatusChange = ({ status }: { status: string }) => {
      setConnectionStatus(normalizeConnectionStatus(status));
    };

    // Initial update
    updateUsers();
    setConnectionStatus(getConnectionStatusFromProvider(provider));

    // Listen for awareness changes
    awareness.on("change", updateUsers);
    provider.on("status", handleStatusChange);

    return () => {
      awareness.off("change", updateUsers);
      provider.off("status", handleStatusChange);
    };
  }, [provider]);

  if (!provider) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            connectionStatus === "connected"
              ? "bg-green-500"
              : connectionStatus === "connecting"
                ? "bg-amber-500"
                : "bg-gray-400"
          }`}
        />
        <span className="text-xs text-gray-600">
          {connectionStatus === "connected"
            ? "Connected"
            : connectionStatus === "connecting"
              ? "Connecting..."
              : "Disconnected"}
        </span>
      </div>

      {/* Active collaborators */}
      {users.length > 0 && (
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
          <PeopleRegular className="w-4 h-4 text-gray-500" />
          <div className="flex -space-x-2">
            {users.slice(0, 5).map((user) => (
              <div
                key={user.clientID}
                className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                style={{ backgroundColor: user.user.color }}
                title={user.user.name}
              >
                {user.user.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-xs text-gray-600">
            {users.length} {users.length === 1 ? "person" : "people"} editing
          </span>
        </div>
      )}
    </div>
  );
}
