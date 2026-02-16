import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect } from "react";

import { mentionStore } from "@/components/editor/MentionMenu";

/**
 * Hook that fetches documents for the @ mention feature.
 * Updates the global mention store with search results.
 */
export function useMentionDocuments(organizationId: string, searchTerm: string = "") {
  const [searchResults] = useQuery(
    queries.documents.search({
      organizationId: organizationId,
      searchTerm: searchTerm,
    }),
  );

  // Update the mention store whenever results change
  useEffect(() => {
    if (searchResults) {
      const items = searchResults.map((doc) => ({
        id: doc.id,
        title: doc.title,
      }));
      mentionStore.setResults(items);
    }
  }, [searchResults]);

  return searchResults;
}

/**
 * Hook to pre-fetch all documents for the mention menu.
 * Call this once at the component level to load initial document list.
 */
export function usePreloadMentionDocuments(organizationId: string) {
  // Fetch all documents (empty search term returns all)
  const [allDocuments] = useQuery(
    queries.documents.search({
      organizationId: organizationId,
      searchTerm: "",
    }),
  );

  useEffect(() => {
    if (allDocuments) {
      const items = allDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
      }));
      mentionStore.setResults(items);
    }
  }, [allDocuments]);
}
