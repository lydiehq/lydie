import {
  Add16Filled,
  AppFolder16Filled,
  Delete12Filled,
  DocumentAdd16Regular,
  Home16Filled,
  PersonChat16Filled,
} from "@fluentui/react-icons";
import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { composeTailwindRenderProps, focusRing } from "@lydie/ui/components/generic/utils";
import { CollapseArrow } from "@lydie/ui/components/icons/CollapseArrow";
import { Eyebrow } from "@lydie/ui/components/layout/Eyebrow";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { memo, useMemo } from "react";
import { Button as RACButton, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import { toast } from "sonner";

import { isFavoritesExpandedAtom, isDocumentsExpandedAtom } from "@/atoms/workspace-settings";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
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

export const Sidebar = memo(function Sidebar({ isCollapsed, onToggle }: Props) {
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

  const handleQuickActionClick = () => {
    setCommandMenuState({
      isOpen: true,
      initialPage: undefined,
    });
  };
  const { createDocument } = useDocumentActions();

  return (
    <div className="flex flex-col grow max-h-screen">
      <div className="flex justify-between items-center px-3 pt-2.5 pb-1">
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
      <div className={`flex flex-col ${isCollapsed ? "hidden" : ""} grow min-h-0`}>
        <div className="flex gap-x-1 px-3 mb-2">
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
          <TooltipTrigger delay={500}>
            <Button
              intent="secondary"
              size="icon-sm"
              onPress={() => createDocument()}
              aria-label="Create new document"
            >
              <DocumentAdd16Regular
                className={sidebarItemIconStyles({ className: "size-[14px] icon-muted" })}
              />
            </Button>
            <Tooltip>Add document</Tooltip>
          </TooltipTrigger>
        </div>
        <div className="flex flex-col px-2 mb-2">
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
              <Delete12Filled className={sidebarItemIconStyles({ className: "size-4" })} />
              <span className="truncate flex-1">Trash</span>
            </div>
          </Link>
        </div>
        <div className="flex flex-col grow min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white">
          <FavoritesSection />
          <DocumentsSection />
          <CollectionsSection />
        </div>
        <div className="px-2">{isFreePlan && !userIsAdmin && <UsageStats />}</div>
        <div className="flex flex-col gap-y-4 px-2.5 pb-1">
          <FeedbackWidget />
        </div>
      </div>
    </div>
  );
});

const FavoritesSection = memo(function FavoritesSection() {
  const [isExpanded, setIsExpanded] = useAtom(isFavoritesExpandedAtom);
  const { organization } = useOrganization();
  const [orgData] = useQuery(
    queries.organizations.documents({
      organizationSlug: organization.slug,
    }),
  );

  const documents = orgData?.documents || [];
  const hasFavorites = documents.some((doc) => doc.is_favorited && !doc.integration_link_id);

  if (!hasFavorites) {
    return null;
  }

  return (
    <Disclosure
      className="group flex flex-col"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="w-full flex items-center shrink-0 px-3 group gap-x-2 py-1">
        <Eyebrow className="ml-1">Favorites</Eyebrow>
        <Heading>
          <RACButton
            slot="trigger"
            className="text-gray-400 hover:text-gray-700 p-1 -ml-0.5 group/button relative size-5 rounded-md hover:bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <CollapseArrow
              aria-hidden
              className={`size-3 shrink-0 absolute text-black/45 transition-transform duration-200 ease-in-out ${isExpanded ? "rotate-90" : "rotate-0"}`}
            />
          </RACButton>
        </Heading>
      </div>
      <DisclosurePanel className="overflow-hidden">
        <div className="px-2 pb-2">
          <FavoritesTree />
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
});

const DocumentsSection = memo(function DocumentsSection() {
  const [isExpanded, setIsExpanded] = useAtom(isDocumentsExpandedAtom);
  const { createDocument } = useDocumentActions();

  return (
    <Disclosure
      className="group flex flex-col"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="w-full flex items-center shrink-0 px-3 group gap-x-2 py-1">
        <Eyebrow className="ml-1">Documents</Eyebrow>
        <Heading>
          <RACButton
            slot="trigger"
            className="text-gray-400 hover:text-gray-700 p-1 -ml-0.5 group/button relative size-5 rounded-md hover:bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <CollapseArrow
              aria-hidden
              className={`size-3 shrink-0 absolute text-black/45 transition-transform duration-200 ease-in-out ${isExpanded ? "rotate-90" : "rotate-0"}`}
            />
          </RACButton>
        </Heading>
        <div className="flex items-center gap-x-1 ml-auto">
          <RACButton
            onPress={() => createDocument()}
            className="text-gray-400 hover:text-gray-700 p-1 -ml-0.5 group/button relative size-5 rounded-md hover:bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <Add16Filled aria-hidden className="size-3 shrink-0 absolute text-black/45" />
          </RACButton>
        </div>
      </div>
      <DisclosurePanel className="px-2 pb-2">
        <DocumentTree />
      </DisclosurePanel>
    </Disclosure>
  );
});

const CollectionsSection = memo(function CollectionsSection() {
  const { organization } = useOrganization();
  const z = useZero();
  const [collections] = useQuery(
    queries.collections.byOrganization({
      organizationId: organization.id,
    }),
  );

  const handleCreateCollection = async () => {
    const name = "Untitled Collection";
    const randomSuffix = createId().slice(0, 6).toLowerCase();
    const handle = `${slugify(name) || "collection"}-${randomSuffix}`;

    try {
      await z.mutate(
        mutators.collection.create({
          organizationId: organization.id,
          name,
          handle,
          properties: [],
        }),
      );

      window.location.assign(`/w/${organization.slug}/collections/${handle}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create collection");
    }
  };

  if (!collections || collections.length === 0) {
    return (
      <div className="px-3 py-2">
        <div className="mb-1 ml-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Collections
        </div>
        <button
          type="button"
          onClick={() => void handleCreateCollection()}
          className="w-full rounded-md px-1.5 py-1 text-left text-sm text-gray-500 hover:bg-black/5 hover:text-gray-700"
        >
          + New Collection
        </button>
      </div>
    );
  }

  return (
    <Disclosure className="group flex flex-col" defaultExpanded>
      <div className="w-full flex items-center shrink-0 px-3 group gap-x-2 py-1">
        <Eyebrow className="ml-1">Collections</Eyebrow>
      </div>
      <DisclosurePanel className="px-2 pb-2 space-y-0.5">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            to="/w/$organizationSlug/collections/$handle"
            params={{ organizationSlug: organization.slug, handle: collection.handle }}
            className={sidebarItemStyles({ className: "px-1.5" })}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <AppFolder16Filled className={sidebarItemIconStyles({ className: "size-4" })} />
              <span className="truncate flex-1">{collection.name}</span>
            </div>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => void handleCreateCollection()}
          className="w-full rounded-md px-1.5 py-1 text-left text-sm text-gray-500 hover:bg-black/5 hover:text-gray-700"
        >
          + New Collection
        </button>
      </DisclosurePanel>
    </Disclosure>
  );
});
