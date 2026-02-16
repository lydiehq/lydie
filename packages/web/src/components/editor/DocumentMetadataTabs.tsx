import type { QueryResultType } from "@rocicorp/zero";

import { ArrowBidirectionalLeftRightFilled, ArrowRightFilled } from "@fluentui/react-icons";
import { MetadataTabsShell } from "@lydie/ui/components/editor/MetadataTabsShell";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useRef, useState } from "react";
import { TabPanel } from "react-aria-components";

import { Link } from "@/components/generic/Link";
import { focusRing } from "@lydie/ui/components/generic/utils";

import { CustomFieldsEditor, type CustomFieldsEditorRef } from "./CustomFieldsEditor";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

type Props = {
  doc: DocumentType;
  initialFields?: Record<string, string | number>;
};

function LinksPanel({ doc }: { doc: DocumentType }) {
  const organizationId = doc.organization_id;

  // Fetch backlinks (docs that link TO this doc)
  const [backlinks] = useQuery(
    queries.documents.backlinks({
      organizationId,
      documentId: doc.id,
    })
  );

  // Fetch outgoing links (docs this doc links TO)
  const [outgoingLinks] = useQuery(
    queries.documents.outgoingLinks({
      organizationId,
      documentId: doc.id,
    })
  );

  const backlinkCount = backlinks?.length || 0;
  const outgoingCount = outgoingLinks?.length || 0;
  const totalLinks = backlinkCount + outgoingCount;

  if (totalLinks === 0) {
    return (
      <div className="ring ring-black/4 rounded-xl p-2 flex items-center justify-center">
        <span className="text-sm font-medium text-gray-600">No links yet</span>
      </div>
    );
  }

  return (
    <div className="max-h-[180px] overflow-y-auto space-y-3">
      {/* Backlinks - docs linking TO this doc */}
      {backlinkCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-x-1.5 text-xs font-medium text-gray-500 px-1">
            <ArrowBidirectionalLeftRightFilled className="size-3.5" />
            <span>Links to this page</span>
            <span className="text-gray-400">({backlinkCount})</span>
          </div>
          <div className="space-y-0.5">
            {backlinks?.map((link) => (
              <Link
                key={link.id}
                to={`/w/$organizationSlug/${link.sourceDocument.id}`}
                from="/w/$organizationSlug"
                className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
              >
                <div className="flex gap-x-1.5 items-center">
                  <DocumentIcon className="size-4 text-gray-400" />
                  <span className="truncate text-sm font-medium text-gray-600">
                    {link.sourceDocument.title || "Untitled document"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing links - docs this doc links TO */}
      {outgoingCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-x-1.5 text-xs font-medium text-gray-500 px-1">
            <ArrowRightFilled className="size-3.5" />
            <span>Links from this page</span>
            <span className="text-gray-400">({outgoingCount})</span>
          </div>
          <div className="space-y-0.5">
            {outgoingLinks?.map((link) => (
              <Link
                key={link.id}
                to={`/w/$organizationSlug/${link.targetDocument.id}`}
                from="/w/$organizationSlug"
                className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
              >
                <div className="flex gap-x-1.5 items-center">
                  <DocumentIcon className="size-4 text-gray-400" />
                  <span className="truncate text-sm font-medium text-gray-600">
                    {link.targetDocument.title || "Untitled document"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentMetadataTabs({ doc, initialFields = {} }: Props) {
  const organizationId = doc.organization_id;

  // Fetch link counts for the badge
  const [backlinks] = useQuery(
    queries.documents.backlinks({
      organizationId,
      documentId: doc.id,
    })
  );
  const [outgoingLinks] = useQuery(
    queries.documents.outgoingLinks({
      organizationId,
      documentId: doc.id,
    })
  );

  const linkCount = (backlinks?.length || 0) + (outgoingLinks?.length || 0);
  const customFieldsEditorRef = useRef<CustomFieldsEditorRef>(null);
  const [selectedKey, setSelectedKey] = useState<string>("fields");
  const [isExpanded, setIsExpanded] = useState(true);

  const handleAdd = () => {
    if (selectedKey === "fields") {
      customFieldsEditorRef.current?.addField();
    }
  };

  return (
    <MetadataTabsShell
      selectedKey={selectedKey}
      onSelectionChange={setSelectedKey}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      documentCount={linkCount}
      onAdd={handleAdd}
      addButtonLabel={selectedKey === "fields" ? "Add field" : undefined}
      focusRing={focusRing}
    >
      <TabPanel id="fields">
        <CustomFieldsEditor
          key={doc.id}
          ref={customFieldsEditorRef}
          documentId={doc.id}
          organizationId={doc.organization_id}
          initialFields={initialFields}
        />
      </TabPanel>
      <TabPanel id="documents">
        <LinksPanel doc={doc} />
      </TabPanel>
    </MetadataTabsShell>
  );
}
