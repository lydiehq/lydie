import type { QueryResultType } from "@rocicorp/zero";

import { AddRegular } from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { useContext, useRef, useState } from "react";
import { DisclosureStateContext, Disclosure, DisclosurePanel } from "react-aria-components";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "react-aria-components";

import { Button } from "@/components/generic/Button";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { focusRing } from "@/utils/focus-ring";

import { Link } from "../generic/Link";
import { composeTailwindRenderProps } from "../generic/utils";
import { CustomFieldsEditor, type CustomFieldsEditorRef } from "./CustomFieldsEditor";
import { CollapseArrow } from "./icons/CollapseArrow";
import { DocumentIcon } from "./icons/DocumentIcon";

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

function MetadataDisclosureHeader() {
  const { isExpanded } = useContext(DisclosureStateContext)!;

  return (
    <Button slot="trigger" intent="ghost" size="icon-sm">
      <CollapseArrow
        className={`size-3.5 text-gray-500 transition-transform duration-200 ${
          isExpanded ? "rotate-90" : "rotate-270"
        }`}
      />
    </Button>
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
    <Disclosure
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      className={isExpanded ? "mb-5 pb-5 border-b border-gray-200" : "pb-5"}
    >
      <Tabs selectedKey={selectedKey} onSelectionChange={(key) => setSelectedKey(key as string)}>
        <div className="flex items-center justify-between">
          <TabList
            aria-label="Metadata tabs"
            className="rounded-full p-[3px] bg-black/3 flex gap-x-0.5 items-center w-fit"
          >
            <Tab
              id="fields"
              className={composeTailwindRenderProps(
                focusRing,
                "rounded-full px-3 py-0.5 text-sm font-medium selected:bg-white selected:shadow-surface selected:text-gray-600 data-hovered:text-gray-600 text-gray-500 cursor-default not-selected:hover:bg-black/5",
              )}
            >
              Fields
            </Tab>
            <Tab
              id="documents"
              className={composeTailwindRenderProps(
                focusRing,
                "rounded-full px-3 py-0.5 text-sm font-medium flex items-center gap-x-1.5 selected:bg-white selected:shadow-surface selected:text-gray-600 data-hovered:text-gray-600 text-gray-500 cursor-default not-selected:hover:bg-black/5",
              )}
            >
              <span>Documents</span>
              <span className="text-[10px]/none -mb-px text-gray-400">{documentCount}</span>
            </Tab>
          </TabList>
          <div className="flex gap-x-1">
            <Button size="sm" intent="ghost" onPress={handleAdd}>
              <AddRegular className="size-4 mr-1" />
              {selectedKey === "fields" ? "Add field" : "Add document"}
            </Button>

            <MetadataDisclosureHeader />
          </div>
        </div>
        <DisclosurePanel className="mt-2">
          <TabPanels>
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
          </TabPanels>
        </DisclosurePanel>
      </Tabs>
    </Disclosure>
  );
}
