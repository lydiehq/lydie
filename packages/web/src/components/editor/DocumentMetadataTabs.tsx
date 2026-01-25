import type { QueryResultType } from "@rocicorp/zero";

import { AddRegular } from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { useContext, useState } from "react";
import {
  Button as RACButton,
  DisclosureStateContext,
  Heading,
  Disclosure,
  DisclosurePanel,
} from "react-aria-components";

import { Button } from "@/components/generic/Button";
import { useDocumentActions } from "@/hooks/use-document-actions";

import { Link } from "../generic/Link";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import { CollapseArrow } from "./icons/CollapseArrow";
import { DocumentIcon } from "./icons/DocumentIcon";

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
      <div className="ring ring-black/4 rounded-xl p-2 flex items-center justify-center">
        <span className="text-sm font-medium text-gray-600">No child pages yet</span>
        <Button
          size="sm"
          intent="ghost"
          onPress={handleCreateChildPage}
          className="text-gray-600 hover:text-gray-900"
        >
          <AddRegular className="size-4 mr-1" />
          Add document
        </Button>
      </div>
    );
  }

  return (
    <div className="">
      <Button
        size="sm"
        intent="ghost"
        onPress={handleCreateChildPage}
        className="text-gray-600 hover:text-gray-900"
      >
        <AddRegular className="size-4 mr-1" />
        Add page
      </Button>
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
    </div>
  );
}

function MetadataDisclosureHeader({
  selectedTab,
  onTabChange,
  documentCount,
}: {
  selectedTab: "fields" | "documents";
  onTabChange: (tab: "fields" | "documents") => void;
  documentCount: number;
}) {
  const { isExpanded } = useContext(DisclosureStateContext)!;

  return (
    <Heading className="m-0">
      <div className="flex items-center gap-x-1">
        <div className="rounded-full p-[3px] bg-black/3 flex gap-x-0.5 items-center">
          <button
            onClick={() => onTabChange("fields")}
            className={`rounded-full px-3 py-0.5 text-sm font-medium transition-all cursor-default ${
              selectedTab === "fields"
                ? "bg-white shadow-surface text-gray-600"
                : "text-gray-500 hover:text-gray-600"
            }`}
          >
            Fields
          </button>
          <button
            onClick={() => onTabChange("documents")}
            className={`rounded-full px-3 py-0.5 text-sm font-medium flex items-center gap-x-1 transition-all cursor-default ${
              selectedTab === "documents"
                ? "bg-white shadow-surface text-gray-600"
                : "text-gray-500 hover:text-gray-600"
            }`}
          >
            <span>Documents</span>
            <span className="text-xs text-gray-400">{documentCount}</span>
          </button>
        </div>
        <RACButton
          slot="trigger"
          className="size-6 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors cursor-default"
        >
          <CollapseArrow
            className={`size-3.5 text-gray-500 transition-transform duration-200 ${
              isExpanded ? "rotate-0" : "rotate-180"
            }`}
          />
        </RACButton>
      </div>
    </Heading>
  );
}

export function DocumentMetadataTabs({ doc, initialFields = {} }: Props) {
  const [selectedTab, setSelectedTab] = useState<"fields" | "documents">("fields");
  const documentCount = doc?.children?.length || 0;

  return (
    <Disclosure defaultExpanded={true}>
      <MetadataDisclosureHeader
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        documentCount={documentCount}
      />
      <DisclosurePanel className="mt-2 mb-4">
        {selectedTab === "fields" ? (
          <CustomFieldsEditor
            documentId={doc.id}
            organizationId={doc.organization_id}
            initialFields={initialFields}
          />
        ) : (
          <SubDocuments doc={doc} />
        )}
      </DisclosurePanel>
    </Disclosure>
  );
}
