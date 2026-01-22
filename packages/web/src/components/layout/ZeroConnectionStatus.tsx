import { useConnectionState } from "@rocicorp/zero/react"
import { useZero } from "@/services/zero"
import { Tooltip, TooltipTrigger } from "../generic/Tooltip"
import { useCallback } from "react"
import clsx from "clsx"
import {
  Wifi4Regular,
  WifiOffRegular,
  ErrorCircleRegular,
  ArrowClockwiseRegular,
  ShieldErrorRegular,
} from "@fluentui/react-icons"

export function ZeroConnectionStatus() {
  const state = useConnectionState()
  const zero = useZero()

  const handleRetry = useCallback(() => {
    if (zero?.connection) {
      zero.connection.connect()
    }
  }, [zero])

  const getStatusConfig = () => {
    switch (state.name) {
      case "connecting":
        return {
          icon: ArrowClockwiseRegular,
          label: "Connecting...",
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          borderColor: "border-amber-200",
          tooltip: state.reason || "Connecting to Zero cache",
        }
      case "connected":
        return {
          icon: Wifi4Regular,
          label: "Connected",
          color: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          tooltip: "Connected to Zero cache",
        }
      case "disconnected":
        return {
          icon: WifiOffRegular,
          label: "Offline",
          color: "text-gray-600",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          tooltip: state.reason || "Disconnected from Zero cache",
        }
      case "error":
        return {
          icon: ErrorCircleRegular,
          label: "Error",
          color: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          tooltip: state.reason || "Connection error",
          clickable: true,
        }
      case "needs-auth":
        return {
          icon: ShieldErrorRegular,
          label: "Auth Required",
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          borderColor: "border-orange-200",
          tooltip: "Authentication required",
          clickable: true,
        }
      default:
        return {
          icon: WifiOffRegular,
          label: "Unknown",
          color: "text-gray-600",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          tooltip: "Unknown connection state",
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon
  const isAnimating = state.name === "connecting"

  return (
    <TooltipTrigger>
      <div
        className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
          config.bgColor,
          config.borderColor,
          config.clickable && "cursor-pointer hover:opacity-80",
        )}
        onClick={config.clickable ? handleRetry : undefined}
        title={config.tooltip}
      >
        <Icon className={clsx("size-4 shrink-0", config.color, isAnimating && "animate-spin")} />
        <span className={clsx("text-xs font-medium", config.color)}>{config.label}</span>
      </div>
      <Tooltip placement="right">
        {config.tooltip}
        {config.clickable && " (Click to retry)"}
      </Tooltip>
    </TooltipTrigger>
  )
}
