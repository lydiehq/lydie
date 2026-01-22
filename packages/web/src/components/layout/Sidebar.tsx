import { DocumentTree } from "./DocumentTree"
import { useDocumentActions } from "@/hooks/use-document-actions"
import { Button as RACButton } from "react-aria-components"
import { Button } from "../generic/Button"
import { OrganizationMenu } from "./OrganizationMenu"
import { Tooltip, TooltipTrigger } from "../generic/Tooltip"
import { Link } from "@tanstack/react-router"
import { composeTailwindRenderProps, focusRing } from "../generic/utils"
import { cva } from "cva"
import { UsageStats } from "./UsageStats"
import { useConnectionState } from "@rocicorp/zero/react"
import { useZero } from "@/services/zero"
import { useCallback } from "react"
import clsx from "clsx"
import { useOrganization } from "@/context/organization.context"
import { SidebarIcon } from "./SidebarIcon"
import { useSetAtom } from "jotai"
import { commandMenuStateAtom } from "@/stores/command-menu"
import { FeedbackWidget } from "../feedback/FeedbackWidget"
import {
  SearchFilled,
  Home24Filled as HomeFilled,
  Wifi4Regular,
  WifiOffRegular,
  ErrorCircleRegular,
  ArrowClockwiseRegular,
  ShieldErrorRegular,
  TabDesktopMultipleFilled,
  PersonChatFilled,
  DocumentAddFilled,
  TextBulletListSquareEditRegular,
} from "@fluentui/react-icons"
import { Separator } from "../generic/Separator"
import { Eyebrow } from "../generic/Eyebrow"
import { useMemo } from "react"
import { useAuth } from "@/context/auth.context"
import { isAdmin } from "@/utils/admin"

type Props = {
  isCollapsed: boolean
  onToggle: () => void
}

export const sidebarItemStyles = cva({
  base: "group flex items-center h-[28px] rounded-md text-sm font-medium mb-0.5 [&.active]:bg-black/5 transition-colors duration-75",
  variants: {
    isCurrent: {
      true: "bg-black/5",
      false: "text-gray-600 hover:bg-black/3",
    },
  },
  defaultVariants: {
    isCurrent: false,
  },
})

export const sidebarItemIconStyles = cva({
  base: "text-black/34 group-hover:text-black/44",
})

export function Sidebar({ isCollapsed, onToggle }: Props) {
  const { createDocument } = useDocumentActions()
  const { organization } = useOrganization()
  const { user } = useAuth()
  const userIsAdmin = isAdmin(user)
  const setCommandMenuState = useSetAtom(commandMenuStateAtom)

  const isFreePlan = useMemo(() => {
    if (!organization) {
      return true
    }

    const hasProAccess =
      organization.subscriptionPlan === "pro" && organization.subscriptionStatus === "active"

    return !hasProAccess
  }, [organization])

  const handleSearchClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: "search",
    })
  }

  const handleQuickActionClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: undefined,
    })
  }

  return (
    <div className="flex flex-col grow max-h-screen overflow-hidden">
      <div className={`flex justify-between items-center p-3 ${!isCollapsed ? "-ml-1" : ""}`}>
        <OrganizationMenu isCollapsed={isCollapsed} />
        {/* <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              `p-1 rounded hover:bg-black/5 text-gray-700 group ${
                isCollapsed ? "hidden" : ""
              }`
            )}
            onPress={onToggle}
            aria-label="Collapse sidebar"
          >
            <SidebarIcon direction="left" collapsed={false} />
          </RACButton>
          <Tooltip>Collapse sidebar</Tooltip>
        </TooltipTrigger> */}

        <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(focusRing, `group p-1 -m-1 ${isCollapsed ? "hidden" : ""}`)}
            onPress={onToggle}
            aria-label="Collapse sidebar"
          >
            <SidebarIcon direction="left" collapsed={false} />
          </RACButton>
          <Tooltip>Collapse sidebar</Tooltip>
        </TooltipTrigger>
      </div>
      <div
        className={`h-full justify-between items-center flex flex-col p-3 ${!isCollapsed ? "hidden" : ""}`}
      >
        <div></div>
        <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              "p-1 rounded hover:bg-black/5 text-gray-700 group",
            )}
            onPress={onToggle}
            aria-label="Expand sidebar"
          >
            <SidebarIcon direction="left" collapsed={true} />
          </RACButton>
          <Tooltip>Expand sidebar</Tooltip>
        </TooltipTrigger>
      </div>
      <div className={`flex flex-col gap-y-4 pb-2 ${isCollapsed ? "hidden" : ""} grow min-h-0`}>
        <div className="flex gap-x-1 px-2">
          <Button
            intent="secondary"
            size="sm"
            className="grow flex items-center justify-center gap-x-2"
            onPress={handleQuickActionClick}
          >
            <span className="mr-1.5">Quick Action</span>
            <div className="flex items-center">
              <kbd className="px-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded">
                ⌘
              </kbd>
              <kbd className="px-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded">
                K
              </kbd>
            </div>
          </Button>
          <Button intent="secondary" size="sm" onPress={handleSearchClick} aria-label="Search">
            <SearchFilled className="size-[14px] text-gray-600" />
          </Button>
        </div>
        <div className="flex flex-col px-2">
          <Link
            to="/w/$organizationSlug"
            from="/w/$organizationSlug"
            activeOptions={{ exact: true }}
            className={sidebarItemStyles({ className: "px-1.5" })}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <HomeFilled className={sidebarItemIconStyles({ className: "size-4.5" })} />
              <span className="truncate flex-1">Home</span>
            </div>
          </Link>
          <Link
            to="/w/$organizationSlug/assistant"
            from="/w/$organizationSlug"
            activeOptions={{ exact: true }}
            className={sidebarItemStyles({ className: "px-1.5" })}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <PersonChatFilled className={sidebarItemIconStyles({ className: "size-4.5" })} />
              <span className="truncate flex-1">Assistant</span>
            </div>
          </Link>
          <Link
            to="/w/$organizationSlug/settings/integrations"
            from="/w/$organizationSlug"
            activeOptions={{ exact: true }}
            className={sidebarItemStyles({ className: "px-1.5" })}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <TabDesktopMultipleFilled className={sidebarItemIconStyles({ className: "size-4.5" })} />
              <span className="truncate flex-1">Integrations</span>
            </div>
          </Link>
        </div>
        <Separator className="mx-2" />
        <div className="flex flex-col grow min-h-0">
          <div className="flex items-center justify-between shrink-0 px-4">
            <Eyebrow>Documents</Eyebrow>
            <div className="flex gap-x-1">
              <TooltipTrigger delay={500}>
                <RACButton
                  className="p-1 rounded hover:bg-black/5 text-gray-600 flex bg-white shadow-surface"
                  onPress={() => createDocument()}
                  aria-label="Create new document"
                >
                  <TextBulletListSquareEditRegular className="size-4.5 text-gray-500" />
                </RACButton>
                <Tooltip>Add document</Tooltip>
              </TooltipTrigger>
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white px-2 py-2">
            <DocumentTree />
          </div>
        </div>
        <div className="px-2">{isFreePlan && !userIsAdmin && <UsageStats />}</div>
        <BottomBar />
      </div>
    </div>
  )
}

function BottomBar() {
  const { user } = useAuth()
  const userIsAdmin = isAdmin(user)

  return (
    <div className="flex flex-col gap-y-4 px-2.5 pb-1">
      <FeedbackWidget />
      {/* {userIsAdmin && <ZeroConnectionStatus />} */}
    </div>
  )
}

function ZeroConnectionStatus() {
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
          tooltip: state.reason || "Connecting to Zero cache",
        }
      case "connected":
        return {
          icon: Wifi4Regular,
          tooltip: "Connected to Zero cache",
        }
      case "disconnected":
        return {
          icon: WifiOffRegular,
          tooltip: state.reason || "Disconnected from Zero cache",
        }
      case "error":
        return {
          icon: ErrorCircleRegular,
          tooltip: state.reason || "Connection error",
          clickable: true,
        }
      case "needs-auth":
        return {
          icon: ShieldErrorRegular,
          tooltip: "Authentication required",
          clickable: true,
        }
      default:
        return {
          icon: WifiOffRegular,
          tooltip: "Unknown connection state",
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon
  const isAnimating = state.name === "connecting"

  return (
    <TooltipTrigger>
      <RACButton
        className=""
        onPress={config.clickable ? handleRetry : undefined}
        aria-label={config.tooltip}
      >
        <Icon className={clsx("size-4 shrink-0 text-gray-400", isAnimating && "animate-spin")} />
      </RACButton>
      <Tooltip placement="right">
        {config.tooltip}
        {config.clickable && " (Click to retry)"}
      </Tooltip>
    </TooltipTrigger>
  )
}
