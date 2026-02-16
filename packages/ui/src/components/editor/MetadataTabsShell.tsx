import { AddRegular } from "@fluentui/react-icons";
import { useContext } from "react";
import { DisclosureStateContext, Disclosure, DisclosurePanel } from "react-aria-components";
import { Tabs, TabList, Tab, TabPanels } from "react-aria-components";

import { Button } from "../generic/Button";
import { composeTailwindRenderProps } from "../generic/utils";
import { CollapseArrow } from "../icons/CollapseArrow";

type MetadataTabsShellProps = {
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  documentCount: number;
  onAdd: () => void;
  addButtonLabel: string;
  children: React.ReactNode;
  focusRing?: string | ((props: { isFocusVisible: boolean }) => string);
};

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

export function MetadataTabsShell({
  selectedKey,
  onSelectionChange,
  isExpanded,
  onExpandedChange,
  documentCount,
  onAdd,
  addButtonLabel,
  children,
  focusRing = "",
}: MetadataTabsShellProps) {
  return (
    <Disclosure
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      className={isExpanded ? "mb-5 pb-5 border-b border-black/6" : "pb-5"}
    >
      <Tabs selectedKey={selectedKey} onSelectionChange={(key) => onSelectionChange(key as string)}>
        <div className="flex items-center justify-between">
          <TabList
            aria-label="Metadata tabs"
            className="rounded-full p-[3px] bg-black/3 flex gap-x-0.5 items-center w-fit relative"
          >
            <Tab
              id="fields"
              className={composeTailwindRenderProps(
                focusRing,
                "rounded-full px-3 py-0.5 text-sm font-medium relative z-10 selected:text-gray-600 data-hovered:text-gray-600 text-gray-500 cursor-default not-selected:hover:bg-black/5 transition-colors",
              )}
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
              id="documents"
              className={composeTailwindRenderProps(
                focusRing,
                "rounded-full px-3 py-0.5 text-sm font-medium flex items-center gap-x-1.5 relative z-10 selected:text-gray-600 data-hovered:text-gray-600 text-gray-500 cursor-default not-selected:hover:bg-black/5 transition-colors",
              )}
            >
              {({ isSelected }) => (
                <>
                  {isSelected && (
                    <span
                      className="absolute inset-0 bg-white shadow-surface rounded-full"
                      style={{ zIndex: -1 }}
                    />
                  )}
                  <span>Documents</span>
                  <span className="text-[10px]/none -mb-px text-gray-400">{documentCount}</span>
                </>
              )}
            </Tab>
          </TabList>
          <div className="flex gap-x-1">
            <Button size="sm" intent="ghost" onPress={onAdd}>
              <AddRegular className="size-4 mr-1" />
              {addButtonLabel}
            </Button>
            <MetadataDisclosureHeader />
          </div>
        </div>
        <DisclosurePanel className="mt-2">
          <TabPanels>{children}</TabPanels>
        </DisclosurePanel>
      </Tabs>
    </Disclosure>
  );
}
