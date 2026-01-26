import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo } from "react";

import { useOrganization } from "@/context/organization.context";

import type { Tab } from "@/atoms/tabs";

/**
 * Custom hook to manage tabs with organization-scoped localStorage persistence.
 * Each organization has its own set of open tabs stored separately in localStorage.
 */
export function useOrganizationTabs() {
  const { organization } = useOrganization();

  // Create organization-scoped atoms dynamically
  const organizationTabsAtom = useMemo(
    () =>
      atomWithStorage<Tab[]>(
        `lydie:openTabs:${organization.id}`,
        [],
        undefined,
        { getOnInit: true },
      ),
    [organization.id],
  );

  const organizationActiveTabIdAtom = useMemo(
    () =>
      atomWithStorage<string | null>(
        `lydie:activeTabId:${organization.id}`,
        null,
        undefined,
        { getOnInit: true },
      ),
    [organization.id],
  );

  const [tabs, setTabs] = useAtom(organizationTabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(organizationActiveTabIdAtom);

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    organizationId: organization.id,
  };
}
