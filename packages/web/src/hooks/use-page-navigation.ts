import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function usePageNavigation(organizationSlug: string, setSearch: (value: string) => void) {
  const navigate = useNavigate();

  const handlePageClick = useCallback(() => {
    // Clear search when entering a page (search is global)
    setSearch("");
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug },
    });
  }, [navigate, organizationSlug, setSearch]);

  const handleBackClick = useCallback(() => {
    // Clear search when leaving a page
    setSearch("");
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug },
    });
  }, [navigate, organizationSlug, setSearch]);

  return {
    handlePageClick,
    handleBackClick,
  };
}
