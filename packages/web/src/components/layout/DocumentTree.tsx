import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { useParams } from "@tanstack/react-router";
import { atom, useAtom, useAtomValue } from "jotai";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Key } from "react-aria-components";
import { Tree } from "react-aria-components";

import { documentTabsAtom } from "@/atoms/tabs";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { getUserStorage, setUserStorage } from "@/lib/user-storage";
import { getAncestorIds } from "@/utils/document-tree";

import { DocumentTreeItem } from "./DocumentTreeItem";

type TreeItem = {
  id: string;
  name: string;
  type: "document";
  children?: TreeItem[];
};

const STORAGE_KEY = "lydie:document:tree:expanded:keys";

function loadFromStorage(userId: string | null | undefined): string[] {
  try {
    const stored = getUserStorage(userId, STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return [];
}

function saveToStorage(userId: string | null | undefined, keys: string[]): void {
  try {
    setUserStorage(userId, STORAGE_KEY, JSON.stringify(keys));
  } catch {}
}

export const documentTreeExpandedKeysAtom = atom<string[]>([]);

type QueryDocuments = NonNullable<
  QueryResultType<typeof queries.organizations.documents>
>["documents"];

export function DocumentTree() {
  const { organization } = useOrganization();
  const { id: currentDocId } = useParams({ strict: false });
  const { session } = useAuth();
  const userId = session?.userId;

  const [initialized, setInitialized] = useState(false);
  const [expandedKeysArray, setExpandedKeysArray] = useAtom(documentTreeExpandedKeysAtom);

  useEffect(() => {
    if (!initialized) {
      setExpandedKeysArray(loadFromStorage(userId));
      setInitialized(true);
    }
  }, [initialized, userId, setExpandedKeysArray]);

  useEffect(() => {
    if (initialized) {
      saveToStorage(userId, expandedKeysArray);
    }
  }, [initialized, userId, expandedKeysArray]);

  const [orgData] = useQuery(
    queries.organizations.documents({
      organizationSlug: organization.slug,
    }),
  );

  const treeDocuments = useMemo(
    () =>
      (orgData?.documents || []).filter((document) => {
        return !document.collection_id && !document.integration_link_id;
      }),
    [orgData?.documents],
  );

  const expandedKeys = useMemo(() => {
    const ancestorIds = getAncestorIds(currentDocId, treeDocuments);
    return new Set([...expandedKeysArray, ...ancestorIds]);
  }, [currentDocId, expandedKeysArray, treeDocuments]);

  const treeItems = useMemo(() => {
    const byParent = new Map<string | null, QueryDocuments>();

    for (const document of treeDocuments) {
      const parentId = document.parent_id ?? null;
      const siblings = byParent.get(parentId) ?? [];
      byParent.set(parentId, [...siblings, document]);
    }

    const build = (parentId: string | null): TreeItem[] => {
      const siblings = [...(byParent.get(parentId) ?? [])].sort(
        (first, second) => (first.sort_order ?? 0) - (second.sort_order ?? 0),
      );

      return siblings.map((document) => {
        const children = build(document.id);
        return {
          id: document.id,
          name: document.title || "Untitled document",
          type: "document",
          children: children.length > 0 ? children : undefined,
        };
      });
    };

    return build(null);
  }, [treeDocuments]);

  const openTabs = useAtomValue(documentTabsAtom);
  const openTabIds = useMemo(() => new Set(openTabs.map((tab) => tab.documentId)), [openTabs]);

  const renderItem = useCallback(
    (item: TreeItem): ReactElement => (
      <DocumentTreeItem
        item={item}
        renderItem={renderItem}
        isOpenInTabs={openTabIds.has(item.id)}
      />
    ),
    [openTabIds],
  );

  const { dragAndDropHooks } = useDocumentDragDrop({
    allDocuments: treeDocuments,
  });

  return (
    <Tree
      aria-label="Documents"
      selectionMode="single"
      className="flex flex-col focus:outline-none"
      items={treeItems}
      dragAndDropHooks={dragAndDropHooks}
      expandedKeys={expandedKeys}
      onExpandedChange={(keys: Set<Key>) => {
        setExpandedKeysArray(Array.from(keys).map(String));
      }}
    >
      {renderItem}
    </Tree>
  );
}
