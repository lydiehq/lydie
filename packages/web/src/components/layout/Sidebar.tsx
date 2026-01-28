import {
  Add16Filled,
  ArrowClockwiseRegular,
  ErrorCircleRegular,
  Home16Filled,
  PersonChat16Filled,
  Search16Filled,
  ShieldErrorRegular,
  TabDesktopMultiple16Filled,
  Wifi4Regular,
  WifiOffRegular,
} from "@fluentui/react-icons";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { composeTailwindRenderProps, focusRing } from "@lydie/ui/components/generic/utils";
import { Eyebrow } from "@lydie/ui/components/layout/Eyebrow";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { useConnectionState } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useMemo } from "react";
import { Button as RACButton } from "react-aria-components";

import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
import { commandMenuStateAtom } from "@/stores/command-menu";
import { isAdmin } from "@/utils/admin";

import { FeedbackWidget } from "../feedback/FeedbackWidget";
import { DocumentTree } from "./DocumentTree";
import { OrganizationMenu } from "./OrganizationMenu";
import { SidebarIcon } from "./SidebarIcon";
import { UsageStats } from "./UsageStats";

type Props = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ isCollapsed, onToggle }: Props) {
  const { createDocument } = useDocumentActions();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);
  const setCommandMenuState = useSetAtom(commandMenuStateAtom);

  const isFreePlan = useMemo(() => {
    if (!organization) {
      return true;
    }

    const hasProAccess =
      organization.subscriptionPlan === "pro" && organization.subscriptionStatus === "active";

    return !hasProAccess;
  }, [organization]);

  const handleSearchClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: "search",
    });
  };

  const handleQuickActionClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: undefined,
    });
  };

  return (
    <div className="flex flex-col grow max-h-screen">
      <div className="flex justify-between items-center p-3">
        <OrganizationMenu isCollapsed={isCollapsed} />
        <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              `group p-1 -m-1 ${isCollapsed ? "hidden" : ""}`,
            )}
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
        <div className="flex gap-x-1 px-3">
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
          <Button
            intent="secondary"
            size="icon-sm"
            onPress={handleSearchClick}
            aria-label="Search"
            className="group"
          >
            <Search16Filled className="size-3.5 icon-muted" />
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
              <Home16Filled className={sidebarItemIconStyles({ className: "size-4" })} />
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
              <PersonChat16Filled className={sidebarItemIconStyles({ className: "size-4" })} />
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
              <TabDesktopMultiple16Filled
                className={sidebarItemIconStyles({ className: "size-4" })}
              />
              <span className="truncate flex-1">Integrations</span>
            </div>
          </Link>
        </div>
        <Separator className="mx-2" />
        <div className="flex flex-col grow min-h-0">
          <div className="flex items-center justify-between shrink-0 px-3">
            <Eyebrow>Documents</Eyebrow>
            <TooltipTrigger delay={500}>
              <Button
                intent="secondary"
                size="icon-sm"
                onPress={() => createDocument()}
                aria-label="Create new document"
              >
                <Add16Filled
                  className={sidebarItemIconStyles({ className: "size-3 m-0.5 icon-muted" })}
                />
              </Button>
              <Tooltip>Add document</Tooltip>
            </TooltipTrigger>
          </div>
          <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white px-2 py-2">
            <DocumentTree />
          </div>
        </div>
        <div className="px-2">{isFreePlan && !userIsAdmin && <UsageStats />}</div>
        <BottomBar />
      </div>
    </div>
  );
}

function BottomBar() {
  return (
    <div className="flex flex-col gap-y-4 px-2.5 pb-1">
      <FeedbackWidget />
      {/* {userIsAdmin && <ZeroConnectionStatus />} */}
    </div>
  );
}

function ZeroConnectionStatus() {
  const state = useConnectionState();
  const zero = useZero();

  const handleRetry = useCallback(() => {
    if (zero?.connection) {
      zero.connection.connect();
    }
  }, [zero]);

  const getStatusConfig = () => {
    switch (state.name) {
      case "connecting":
        return {
          icon: ArrowClockwiseRegular,
          tooltip: state.reason || "Connecting to Zero cache",
        };
      case "connected":
        return {
          icon: Wifi4Regular,
          tooltip: "Connected to Zero cache",
        };
      case "disconnected":
        return {
          icon: WifiOffRegular,
          tooltip: state.reason || "Disconnected from Zero cache",
        };
      case "error":
        return {
          icon: ErrorCircleRegular,
          tooltip: state.reason || "Connection error",
          clickable: true,
        };
      case "needs-auth":
        return {
          icon: ShieldErrorRegular,
          tooltip: "Authentication required",
          clickable: true,
        };
      default:
        return {
          icon: WifiOffRegular,
          tooltip: "Unknown connection state",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const isAnimating = state.name === "connecting";

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
  );
}
