import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "react-aria-components";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import { ChildPages } from "./ChildPages";

type Props = {
  documentId: string;
  organizationId: string;
  initialFields?: Record<string, string | number>;
};

export function DocumentMetadataTabs({
  documentId,
  organizationId,
  initialFields = {},
}: Props) {
  return (
    <Tabs defaultSelectedKey="fields" className="flex flex-col gap-y-2">
      <TabList 
        aria-label="Document metadata" 
        className="border-b border-gray-200 flex gap-x-4"
      >
        <Tab 
          id="fields" 
          className="text-gray-500 text-sm px-2 py-1 rounded-none hover:text-gray-700 data-[selected]:text-gray-900 data-[selected]:bg-transparent data-[selected]:border-b-2 data-[selected]:border-gray-900 data-[selected]:mb-[-1px] outline-none"
        >
          Fields
        </Tab>
        <Tab 
          id="subdocuments" 
          className="text-gray-500 text-sm px-2 py-1 rounded-none hover:text-gray-700 data-[selected]:text-gray-900 data-[selected]:bg-transparent data-[selected]:border-b-2 data-[selected]:border-gray-900 data-[selected]:mb-[-1px] outline-none"
        >
          Subdocuments
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="fields" className="p-0 pt-2 outline-none">
          <CustomFieldsEditor
            documentId={documentId}
            organizationId={organizationId}
            initialFields={initialFields}
          />
        </TabPanel>
        <TabPanel id="subdocuments" className="p-0 pt-2 outline-none">
          <ChildPages
            documentId={documentId}
            organizationId={organizationId}
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
}

