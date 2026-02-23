import { ArrowClockwiseRegular, WifiOffRegular } from "@fluentui/react-icons";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { Button } from "@lydie/ui/components/generic/Button";
import { useEffect, useState } from "react";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

type ProviderWithWebsocket = HocuspocusProvider & {
  configuration?: {
    websocketProvider?: {
      status?: string;
      connect?: () => void;
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
  const websocketStatus = (provider as ProviderWithWebsocket | null)?.configuration
    ?.websocketProvider?.status;

  return normalizeConnectionStatus(websocketStatus);
}

function retryConnection(provider: HocuspocusProvider | null): void {
  void (provider as ProviderWithWebsocket | null)?.configuration?.websocketProvider?.connect?.();
}

interface Props {
  provider: HocuspocusProvider | null;
}

export function StatusBar({ provider }: Props) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    getConnectionStatusFromProvider(provider),
  );
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(
    provider?.hasUnsyncedChanges ?? false,
  );

  useEffect(() => {
    if (!provider) {
      setConnectionStatus("disconnected");
      setHasUnsyncedChanges(false);
      return;
    }

    const handleStatusChange = ({ status }: { status: string }) => {
      setConnectionStatus(normalizeConnectionStatus(status));
    };

    const handleUnsyncedChanges = ({ number }: { number: number }) => {
      setHasUnsyncedChanges(number > 0);
    };

    setConnectionStatus(getConnectionStatusFromProvider(provider));
    setHasUnsyncedChanges(provider.hasUnsyncedChanges);
    provider.on("status", handleStatusChange);
    provider.on("unsyncedChanges", handleUnsyncedChanges);

    return () => {
      provider.off("status", handleStatusChange);
      provider.off("unsyncedChanges", handleUnsyncedChanges);
    };
  }, [provider]);

  const showConnectionWarning = connectionStatus !== "connected" && hasUnsyncedChanges;
  const connectionWarningCopy =
    connectionStatus === "connecting"
      ? "Connecting to the collaboration server. Your edits may not sync until the connection is fully restored."
      : "Disconnected from the collaboration server. You can keep editing, but recent changes may not sync until reconnection.";

  if (!showConnectionWarning) {
    return null;
  }

  return (
    <div
      className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
      role="alert"
    >
      <div className="flex items-start gap-2 text-amber-800">
        {connectionStatus === "connecting" ? (
          <ArrowClockwiseRegular className="mt-0.5 size-4 shrink-0 animate-spin" />
        ) : (
          <WifiOffRegular className="mt-0.5 size-4 shrink-0" />
        )}
        <p className="text-xs font-medium">{connectionWarningCopy}</p>
      </div>

      {connectionStatus === "disconnected" && provider ? (
        <Button
          intent="ghost"
          size="sm"
          className="h-7 whitespace-nowrap"
          onPress={() => retryConnection(provider)}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
