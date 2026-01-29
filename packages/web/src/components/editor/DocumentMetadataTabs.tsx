import type { QueryResultType } from "@rocicorp/zero";

import { MetadataTabsShell } from "@lydie/ui/components/editor/MetadataTabsShell";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { queries } from "@lydie/zero/queries";
import { useRef, useState } from "react";
import { TabPanel } from "react-aria-components";

import { Link } from "@/components/generic/Link";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { focusRing } from "@/utils/focus-ring";

import { CustomFieldsEditor, type CustomFieldsEditorRef } from "./CustomFieldsEditor";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

type Props = {
  doc: DocumentType;
  initialFields?: Record<string, string | number>;
};

function SubDocuments({ doc }: { doc: DocumentType }) {
  const children = doc?.children || [];

  if (children.length === 0) {
    return (
      <div className="ring ring-black/4 rounded-xl p-2 flex items-center justify-center">
        <span className="text-sm font-medium text-gray-600">No child pages yet</span>
      </div>
    );
  }

  return (
    <div className="max-h-[180px] overflow-y-auto">
      {children.map((child) => (
        <Link
          key={child.id}
          to={`/w/$organizationSlug/${child.id}`}
          from="/w/$organizationSlug"
          className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
        >
          <div className="flex gap-x-1.5 items-center">
            <DocumentIcon className="size-4 text-gray-400" />
            <span className="truncate text-sm font-medium text-gray-600">
              {child.title || "Untitled document"}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DocumentMetadataTabs({ doc, initialFields = {} }: Props) {
  const documentCount = doc?.children?.length || 0;
  const { createDocument } = useDocumentActions();
  const customFieldsEditorRef = useRef<CustomFieldsEditorRef>(null);
  const [selectedKey, setSelectedKey] = useState<string>("fields");
  const [isExpanded, setIsExpanded] = useState(true);

  const handleAdd = () => {
    if (selectedKey === "fields") {
      customFieldsEditorRef.current?.addField();
    } else if (selectedKey === "documents") {
      createDocument(doc.id);
    }
  };

  return (
    <MetadataTabsShell
      selectedKey={selectedKey}
      onSelectionChange={setSelectedKey}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      documentCount={documentCount}
      onAdd={handleAdd}
      addButtonLabel={selectedKey === "fields" ? "Add field" : "Add document"}
      focusRing={focusRing}
    >
      <TabPanel id="fields">
        <CustomFieldsEditor
          ref={customFieldsEditorRef}
          documentId={doc.id}
          organizationId={doc.organization_id}
          initialFields={initialFields}
        />
      </TabPanel>
      <TabPanel id="documents">
        <SubDocuments doc={doc} />
      </TabPanel>
    </MetadataTabsShell>
  );
}
