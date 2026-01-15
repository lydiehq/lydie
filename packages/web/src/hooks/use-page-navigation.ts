import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function usePageNavigation(
  organizationId: string,
  setSearch: (value: string) => void
) {
  const navigate = useNavigate();

  const handlePageClick = useCallback(
    (pageId: string) => {
      // Clear search when entering a page (search is global)
      setSearch("");
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationId },
        search: { tree: pageId, q: undefined, focusSearch: undefined },
      });
    },
    [navigate, organizationId, setSearch]
  );

  const handleBackClick = useCallback(() => {
    // Clear search when leaving a page
    setSearch("");
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationId },
      search: { tree: undefined, q: undefined, focusSearch: undefined },
    });
  }, [navigate, organizationId, setSearch]);

  return {
    handlePageClick,
    handleBackClick,
  };
}

