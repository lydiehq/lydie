import { mutators } from "@lydie/zero/mutators";
import { useState } from "react";

import { useZero } from "@/services/zero";

type PageConfig = {
  showChildrenInSidebar?: boolean;
  defaultView?: "documents" | "table";
};

type Props = {
  collectionId: string;
  organizationId: string;
  config: PageConfig;
};

export function PageConfigPanel({ collectionId, organizationId, config }: Props) {
  const z = useZero();
  const [isOpen, setIsOpen] = useState(false);
  const hideChildrenInSidebar = !(config.showChildrenInSidebar ?? true);

  const handleUpdate = async (updates: Partial<PageConfig>) => {
    const newConfig = {
      showChildrenInSidebar: config.showChildrenInSidebar ?? true,
      defaultView: config.defaultView ?? "table",
      ...config,
      ...updates,
    };
    await z.mutate(
      mutators.collection.update({
        collectionId,
        organizationId,
        showEntriesInSidebar: !newConfig.showChildrenInSidebar,
      }),
    );
  };

  return (
    <div className="space-y-3">
      {isOpen ? (
        <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-4">
          <h4 className="font-medium text-sm text-gray-900">Page Settings</h4>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">Hide children in sidebar</div>
              <div className="text-xs text-gray-500">Keep child pages out of the document tree</div>
            </div>
            <button
              onClick={() => handleUpdate({ showChildrenInSidebar: hideChildrenInSidebar })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                hideChildrenInSidebar ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  hideChildrenInSidebar ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">Default view</div>
              <div className="text-xs text-gray-500">Open this page in table or document view</div>
            </div>
            <select
              value={config.defaultView || "table"}
              onChange={(e) =>
                handleUpdate({ defaultView: e.target.value as "documents" | "table" })
              }
              className="px-2 py-1 text-sm border rounded"
            >
              <option value="table">Table</option>
              <option value="documents">Documents</option>
            </select>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Done
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Page settings
        </button>
      )}
    </div>
  );
}
