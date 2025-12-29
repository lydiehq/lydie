import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function useFolderNavigation(
  organizationId: string,
  setSearch: (value: string) => void
) {
  const navigate = useNavigate();

  const handleFolderClick = useCallback(
    (folderId: string) => {
      // Clear search when entering a folder (search is global)
      setSearch("");
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationId },
        search: { tree: folderId, q: undefined, focusSearch: undefined },
      });
    },
    [navigate, organizationId, setSearch]
  );

  const handleBackClick = useCallback(() => {
    // Clear search when leaving a folder
    setSearch("");
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationId },
      search: { tree: undefined, q: undefined, focusSearch: undefined },
    });
  }, [navigate, organizationId, setSearch]);

  return {
    handleFolderClick,
    handleBackClick,
  };
}
