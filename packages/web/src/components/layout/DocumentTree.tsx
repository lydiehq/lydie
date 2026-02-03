import type { QueryResultType } from "@rocicorp/zero";
import type { ReactElement } from "react";
import type { Key } from "react-aria-components";

import { getIntegrationMetadata } from "@lydie/integrations/metadata";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useAtom } from "jotai";
import { atom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Tree } from "react-aria-components";

import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { getUserStorage, setUserStorage } from "@/lib/user-storage";

import { DocumentTreeItem } from "./DocumentTreeItem";

type TreeItem = {
  id: string;
  name: string;
  type: "document" | "integration-link" | "integration-group";
  children?: TreeItem[];
  integrationLinkId?: string | null;
  integrationType?: string;
  syncStatus?: string | null;
  isLocked?: boolean;
  isFavorited?: boolean;
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

type QueryResult = NonNullable<QueryResultType<typeof queries.organizations.documents>>;

export function DocumentTree() {
  const { organization } = useOrganization();

  const { session } = useAuth();
  const userId = session?.userId;

  const [initialized, setInitialized] = useState(false);
  const [expandedKeysArray, setExpandedKeysArray] = useAtom(documentTreeExpandedKeysAtom);

  useEffect(() => {
    if (!initialized) {
      const stored = loadFromStorage(userId);
      setExpandedKeysArray(stored);
      setInitialized(true);
    }
  }, [initialized, userId, setExpandedKeysArray]);

  useEffect(() => {
    if (initialized) {
      saveToStorage(userId, expandedKeysArray);
    }
  }, [initialized, userId, expandedKeysArray]);

  const expandedKeys = useMemo(() => new Set(expandedKeysArray), [expandedKeysArray]);

  const handleExpandedChange = (keys: Set<Key>) => {
    setExpandedKeysArray(Array.from(keys).map((key) => String(key)));
  };

  const [orgData] = useQuery(
    queries.organizations.documents({
      organizationSlug: organization.slug,
    }),
  );

  const [connections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organization.id,
    }),
  );

  const [extensionLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization.id,
    }),
  );

  const documents = orgData?.documents || [];

  const buildTreeItems = (parentId: string | null): TreeItem[] => {
    const childDocs = documents.filter(
      (doc) => doc.parent_id === parentId && !doc.integration_link_id,
    );

    const sortedDocs = [...childDocs].sort((a, b) => {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return sortedDocs.map((doc) => {
      const children = buildTreeItems(doc.id);
      return {
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
        children: children.length > 0 ? children : undefined,
        isLocked: doc.is_locked ?? false,
        isFavorited: doc.is_favorited ?? false,
      };
    });
  };

  const buildLinkItems = (linkId: string): TreeItem[] => {
    const linkDocs = documents.filter((doc) => doc.integration_link_id === linkId);

    const buildNestedDocs = (parentId: string | null): TreeItem[] => {
      const childDocs = linkDocs.filter((d) => d.parent_id === parentId);

      const sortedDocs = [...childDocs].sort((a, b) => {
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      return sortedDocs.map((doc) => {
        const children = buildNestedDocs(doc.id);
        return {
          id: doc.id,
          name: doc.title || "Untitled document",
          type: "document" as const,
          children: children.length > 0 ? children : undefined,
          integrationLinkId: doc.integration_link_id,
          isLocked: doc.is_locked ?? false,
          isFavorited: doc.is_favorited ?? false,
        };
      });
    };

    return buildNestedDocs(null);
  };

  const linkGroups = useMemo(() => {
    const connectionGroups = new Map<string, typeof connections>();

    connections?.forEach((connection) => {
      if (connection.status !== "active") return;

      const type = connection.integration_type;
      if (!type) return;

      if (!connectionGroups.has(type)) {
        connectionGroups.set(type, []);
      }
      connectionGroups.get(type)?.push(connection);
    });

    const linkGroupsByType = new Map<string, typeof extensionLinks>();

    extensionLinks.forEach((link) => {
      const type = link.connection?.integration_type;
      if (!type) return;

      if (!linkGroupsByType.has(type)) {
        linkGroupsByType.set(type, []);
      }
      linkGroupsByType.get(type)?.push(link);
    });

    const items: TreeItem[] = [];

    connectionGroups.forEach((_conns, type) => {
      const metadata = getIntegrationMetadata(type);
      if (!metadata) return;

      const linksForType = linkGroupsByType.get(type) || [];

      const sortedLinks = [...linksForType].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );

      items.push({
        id: `integration-group-${type}`,
        name: metadata.name,
        type: "integration-group",
        children: sortedLinks.map((link) => ({
          id: `integration-link-${link.id}`,
          name: link.name,
          type: "integration-link",
          integrationType: link.connection?.integration_type,
          integrationLinkId: link.id,
          syncStatus: link.sync_status,
          children: buildLinkItems(link.id),
        })),
        integrationType: type,
      });
    });

    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return items;
  }, [connections, extensionLinks, documents, buildLinkItems]);

  const treeItems = [...linkGroups, ...buildTreeItems(null)];

  const renderItem = (item: TreeItem): ReactElement => (
    <DocumentTreeItem item={item} renderItem={renderItem} documents={documents} />
  );

  const { dragAndDropHooks } = useDocumentDragDrop({
    allDocuments: documents,
  });

  return (
    <Tree
      aria-label="Documents"
      selectionMode="single"
      className="flex flex-col focus:outline-none"
      items={treeItems}
      dragAndDropHooks={dragAndDropHooks}
      expandedKeys={expandedKeys}
      onExpandedChange={handleExpandedChange}
    >
      {renderItem}
    </Tree>
  );
}
