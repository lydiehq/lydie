import type { Document } from "@lydie/zero/schema";

import { DocumentFilled, SearchFilled } from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import React, { useState } from "react";
import { Input } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";

interface DocumentSearchProps {
  onSelectDocument: (document: Document) => void;
  onBack: () => void;
  exclude?: string; // Exclude current document
}

export function DocumentSearch({ onSelectDocument, onBack, exclude }: DocumentSearchProps) {
  const [query, setQuery] = useState("");

  const { organization } = useOrganization();

  const [documents] = useQuery(queries.documents.byUpdated({ organizationId: organization.id }));

  // Filter documents based on search query
  const filteredDocuments = documents
    .filter((doc) => {
      if (exclude && doc.id === exclude) return false;
      if (!query.trim()) return true;

      const searchTerm = query.toLowerCase();
      return (
        doc.title.toLowerCase().includes(searchTerm) || doc.slug.toLowerCase().includes(searchTerm)
      );
    })
    .slice(0, 8); // Limit to 8 results

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onBack();
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Handle keyboard navigation if needed
    }
  };

  return (
    <div className="p-2 min-w-80 max-w-96">
      <div className="flex items-center gap-2 mb-3">
        <SearchFilled className="size-4 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search documents..."
          className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {filteredDocuments.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">
            {query.trim() ? "No documents found" : "No documents available"}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredDocuments.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-3 transition-colors"
              >
                <DocumentFilled className="size-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {doc.title || "Untitled"}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{doc.slug}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-400">Press Escape to go back</div>
      </div>
    </div>
  );
}
