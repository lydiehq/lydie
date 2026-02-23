import { ArrowBidirectionalLeftRightFilled, ArrowRightFilled } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "react-aria-components";

import { Link } from "@/components/generic/Link";

import { InlinePropertyEditor } from "./InlinePropertyEditor";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;
type FieldValues = Record<string, string | number | boolean | null>;

type Props = {
  doc: DocumentType;
  collectionSchema?: PropertyDefinition[];
};

function InternalLinksPanel({ doc }: { doc: DocumentType }) {
  const organizationId = doc.organization_id;

  const [backlinks] = useQuery(
    queries.documents.backlinks({
      organizationId,
      documentId: doc.id,
    }),
  );

  const [outgoingLinks] = useQuery(
    queries.documents.outgoingLinks({
      organizationId,
      documentId: doc.id,
    }),
  );

  const backlinkCount = backlinks?.length || 0;
  const outgoingCount = outgoingLinks?.length || 0;
  const totalLinks = backlinkCount + outgoingCount;

  if (totalLinks === 0) {
    return (
      <div className="ring ring-black/4 rounded-xl p-2 flex items-center justify-center">
        <span className="text-sm font-medium text-gray-600">No internal links yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[50vh] overflow-y-auto">
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
                to={`/w/$organizationSlug/${link.source_document_id}`}
                from="/w/$organizationSlug"
                className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
              >
                <div className="flex gap-x-1.5 items-center">
                  <DocumentIcon className="size-4 text-gray-400" />
                  <span className="truncate text-sm font-medium text-gray-600">
                    {(link.sourceDocument as { title?: string } | undefined)?.title ||
                      "Untitled document"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

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
                to={`/w/$organizationSlug/${link.target_document_id}`}
                from="/w/$organizationSlug"
                className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
              >
                <div className="flex gap-x-1.5 items-center">
                  <DocumentIcon className="size-4 text-gray-400" />
                  <span className="truncate text-sm font-medium text-gray-600">
                    {(link.targetDocument as { title?: string } | undefined)?.title ||
                      "Untitled document"}
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

function FieldsPanel({ doc, collectionSchema }: Props) {
  const organizationId = doc.organization_id;

  const [fieldValuesData] = useQuery(
    doc.collection_id
      ? queries.collections.documentFieldValues({
          organizationId,
          documentId: doc.id,
        })
      : null,
  );

  const fieldRows = fieldValuesData?.fieldValues ?? [];
  const activeFieldRow =
    fieldRows.find((row) => row.collection_id === doc.collection_id) ?? fieldRows[0];

  const fieldValues: FieldValues = (activeFieldRow?.values as FieldValues) || {};
  const collectionId = activeFieldRow?.collection_id;

  if (!collectionSchema || collectionSchema.length === 0) {
    return (
      <div className="ring ring-black/4 rounded-xl p-4 flex items-center justify-center">
        <span className="text-sm text-gray-500">
          No fields available. This page is not part of a collection.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {collectionSchema.map((fieldDef) => (
        <InlinePropertyEditor
          key={fieldDef.name}
          documentId={doc.id}
          organizationId={organizationId}
          collectionId={collectionId}
          fieldDef={fieldDef}
          value={fieldValues[fieldDef.name] ?? null}
        />
      ))}
    </div>
  );
}

export function DocumentDetails({ doc, collectionSchema }: Props) {
  const organizationId = doc.organization_id;
  const [selectedKey, setSelectedKey] = useState<string>("fields");

  const [backlinks] = useQuery(
    queries.documents.backlinks({
      organizationId,
      documentId: doc.id,
    }),
  );

  const [outgoingLinks] = useQuery(
    queries.documents.outgoingLinks({
      organizationId,
      documentId: doc.id,
    }),
  );

  const linkCount = (backlinks?.length || 0) + (outgoingLinks?.length || 0);

  return (
    <Tabs
      selectedKey={selectedKey}
      onSelectionChange={(key) => setSelectedKey(key as string)}
      className="gap-3"
    >
      <TabList
        aria-label="Page details"
        className="rounded-full p-[3px] bg-black/3 flex gap-x-0.5 items-center w-fit"
      >
        <Tab
          id="fields"
          className="rounded-full px-3 py-0.5 text-sm font-medium relative z-10 selected:text-gray-600 text-gray-500 cursor-default not-selected:hover:bg-black/5 transition-colors"
        >
          {({ isSelected }) => (
            <>
              {isSelected && (
                <span
                  className="absolute inset-0 bg-white shadow-surface rounded-full"
                  style={{ zIndex: -1 }}
                />
              )}
              Fields
            </>
          )}
        </Tab>

        <Tab
          id="internal-links"
          className="rounded-full px-3 py-0.5 text-sm font-medium flex items-center gap-x-1.5 relative z-10 selected:text-gray-600 text-gray-500 cursor-default not-selected:hover:bg-black/5 transition-colors"
        >
          {({ isSelected }) => (
            <>
              {isSelected && (
                <span
                  className="absolute inset-0 bg-white shadow-surface rounded-full"
                  style={{ zIndex: -1 }}
                />
              )}
              <span>Internal links</span>
              <span className="text-[10px]/none -mb-px text-gray-400">{linkCount}</span>
            </>
          )}
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel id="fields" className="p-0">
          <FieldsPanel doc={doc} collectionSchema={collectionSchema} />
        </TabPanel>
        <TabPanel id="internal-links" className="p-0">
          <InternalLinksPanel doc={doc} />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
}
