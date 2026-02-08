import {
  Add16Filled,
  ChevronRightRegular,
  Delete16Regular,
  Home16Filled,
  PersonChat16Filled,
  Search16Filled,
} from "@fluentui/react-icons";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { composeTailwindRenderProps, focusRing } from "@lydie/ui/components/generic/utils";
import { Eyebrow } from "@lydie/ui/components/layout/Eyebrow";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { Link } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useMemo } from "react";
import { Button as RACButton, Disclosure, DisclosurePanel, Heading } from "react-aria-components";

import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { commandMenuStateAtom } from "@/stores/command-menu";
import { isAdmin } from "@/utils/admin";

import { FeedbackWidget } from "../feedback/FeedbackWidget";
import { DocumentTree } from "./DocumentTree";
import { FavoritesTree } from "./FavoritesTree";
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
      <div className={`h-full flex flex-col p-3 ${!isCollapsed ? "hidden" : ""}`} />
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
            to="/w/$organizationSlug/trash"
            from="/w/$organizationSlug"
            activeOptions={{ exact: true }}
            className={sidebarItemStyles({ className: "px-1.5" })}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Delete16Regular className={sidebarItemIconStyles({ className: "size-4" })} />
              <span className="truncate flex-1">Trash</span>
            </div>
          </Link>
        </div>
        <Separator className="mx-2" />
        <div className="flex flex-col grow min-h-0">
          <FavoritesSection />
          <div className="flex items-center justify-between shrink-0 px-3 pt-2">
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

function FavoritesSection() {
  return (
    <Disclosure className="group" defaultExpanded={true}>
      <Heading className="m-0">
        <RACButton
          slot="trigger"
          className="w-full flex items-center justify-between shrink-0 px-3 py-2 hover:bg-black/5 rounded-md transition-colors cursor-default"
        >
          <div className="flex items-center gap-1.5">
            <ChevronRightRegular
              aria-hidden
              className="size-3.5 text-gray-500 transition-transform duration-200 ease-in-out group-data-[expanded]:rotate-90"
            />
            <Eyebrow>Favorites</Eyebrow>
          </div>
        </RACButton>
      </Heading>
      <DisclosurePanel className="h-(--disclosure-panel-height) motion-safe:transition-[height] overflow-clip">
        <div className="px-2 pb-2 pt-1">
          <FavoritesTree />
        </div>
      </DisclosurePanel>
    </Disclosure>
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
