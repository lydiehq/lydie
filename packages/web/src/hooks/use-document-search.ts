import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounceCallback } from "usehooks-ts";

export function useDocumentSearch(
  organizationId: string,
  organizationSlug: string,
  routePath: string,
) {
  const { q, focusSearch } = useSearch({
    from: routePath as any,
  });
  const searchParam = q ?? "";
  const searchFieldRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [search, setSearch] = useState(searchParam);

  // Sync local state when URL param changes (browser back/forward)
  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  // Auto-focus search field when focusSearch param is present
  useEffect(() => {
    if (focusSearch && searchFieldRef.current) {
      // Small delay to ensure the component is fully rendered
      setTimeout(() => {
        searchFieldRef.current?.focus();
      }, 100);
      // Clear the focusSearch param from URL after focusing
      navigate({
        to: "/w/$organizationSlug",
        from: "/w/$organizationSlug",
        params: { organizationSlug },
        search: (prev) => ({
          tree: (prev as { tree?: string })?.tree,
          q: (prev as { q?: string })?.q,
          focusSearch: undefined,
        }),
        replace: true,
      });
    }
  }, [focusSearch, navigate, organizationSlug]);

  const updateSearchParam = useCallback(
    (text: string) => {
      navigate({
        to: "/w/$organizationSlug",
        from: "/w/$organizationSlug",
        params: { organizationSlug },
        search: (prev) => ({
          tree: (prev as { tree?: string })?.tree,
          q: text || undefined,
          focusSearch: undefined,
        }),
        replace: true,
      });
    },
    [navigate, organizationSlug],
  );

  // Debounce the URL navigation - this waits for user to stop typing
  const debouncedUpdateSearchParam = useDebounceCallback(updateSearchParam, 500);

  // Use local search state in query, not searchParam
  const [searchData] = useQuery(
    queries.organizations.searchDocuments({
      organizationId,
      searchTerm: search,
    }),
  );

  const allDocuments = searchData?.documents || [];

  const onSearchChange = (value: string) => {
    setSearch(value);
    debouncedUpdateSearchParam(value);
  };

  return {
    search,
    setSearch,
    searchFieldRef,
    onSearchChange,
    allDocuments,
  };
}
