import type { QueryResultType } from "@rocicorp/zero";

import { AddRegular, ArrowDownRegular } from "@fluentui/react-icons";
import { DocumentFilled } from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { useState } from "react";
import { Button, Tab, TabList, TabPanel, TabPanels, Tabs } from "react-aria-components";

import { Button as GenericButton } from "@/components/generic/Button";
import { useDocumentActions } from "@/hooks/use-document-actions";

import { Link } from "../generic/Link";
import { CustomFieldsEditor } from "./CustomFieldsEditor";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

type Props = {
  doc: DocumentType;
  initialFields?: Record<string, string | number>;
};

function SubDocuments({ doc }: { doc: DocumentType }) {
  const { createDocument } = useDocumentActions();
  const children = doc?.children || [];

  const handleCreateChildPage = async () => {
    createDocument(doc.id);
  };

  if (children.length === 0) {
    return (
      <div className="border-t border-gray-200">
        <GenericButton
          size="sm"
          intent="ghost"
          onPress={handleCreateChildPage}
          className="text-gray-600 hover:text-gray-900"
        >
          <AddRegular className="size-4 mr-1" />
          Add document
        </GenericButton>
      </div>
    );
  }

  return (
    <div className="">
      <GenericButton
        size="sm"
        intent="ghost"
        onPress={handleCreateChildPage}
        className="text-gray-600 hover:text-gray-900"
      >
        <AddRegular className="size-4 mr-1" />
        Add page
      </GenericButton>
      <div className="">
        {children.map((child) => (
          <Link
            key={child.id}
            to={`/w/$organizationSlug/${child.id}`}
            from="/w/$organizationSlug"
            className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
          >
            <div className="flex gap-x-1.5 items-center">
              <DocumentFilled className="size-3.5 text-gray-400" />
              <span className="truncate text-sm font-medium text-gray-600">
                {child.title || "Untitled document"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DocumentMetadataTabs({ doc, initialFields = {} }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | number>("fields");

  const documentCount = doc?.children?.length || 0;

  const handleSelectionChange = (key: string | number) => {
    const previousKey = selectedKey;
    setSelectedKey(key);
    // If switching to a different tab and it's collapsed, uncollapse
    if (key !== previousKey && isCollapsed) {
      setIsCollapsed(false);
    }
  };

  return (
    <Tabs
      selectedKey={selectedKey}
      onSelectionChange={handleSelectionChange}
      className="flex flex-col gap-y-2 w-full mb-6"
    >
      <div className="flex justify-between w-full border-b border-gray-200">
        <TabList aria-label="Document metadata" className=" flex gap-x-4">
          <Tab
            id="fields"
            className="text-gray-500 text-sm px-2 py-1 rounded-none hover:text-gray-700 selected:text-gray-900 selected:bg-transparent selected:border-b-2 selected:border-gray-900 outline-none cursor-default"
          >
            Fields
          </Tab>
          <Tab
            id="subdocuments"
            className="text-gray-500 text-sm px-2 py-1 rounded-none hover:text-gray-700 selected:text-gray-900 selected:bg-transparent selected:border-b-2 selected:border-gray-900 outline-none cursor-default flex items-center gap-x-1"
          >
            <span>Documents</span>
            <span className="text-xs text-gray-400">{documentCount}</span>
          </Tab>
        </TabList>
        <Button onPress={() => setIsCollapsed(!isCollapsed)}>
          <div
            style={{
              transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <ArrowDownRegular className="size-3.5 text-black/34 hover:text-black/44" />
          </div>
        </Button>
      </div>

      <div>
        <TabPanels>
          <TabPanel id="fields" className="p-0 pt-2 outline-none">
            <CustomFieldsEditor
              documentId={doc.id}
              organizationId={doc.organization_id}
              initialFields={initialFields}
            />
          </TabPanel>
          <TabPanel id="subdocuments" className="p-0 pt-2 outline-none">
            <SubDocuments doc={doc} />
          </TabPanel>
        </TabPanels>
      </div>
    </Tabs>
  );
}
