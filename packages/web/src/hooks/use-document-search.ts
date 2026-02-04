import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useRef, useState } from "react";

export function useDocumentSearch(organizationId: string) {
  const searchFieldRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");

  // Use local search state in query
  const [searchData] = useQuery(
    queries.organizations.searchDocuments({
      organizationId,
      searchTerm: search,
    }),
  );

  const allDocuments = searchData?.documents || [];

  const onSearchChange = (value: string) => {
    setSearch(value);
  };

  return {
    search,
    setSearch,
    searchFieldRef,
    onSearchChange,
    allDocuments,
  };
}
