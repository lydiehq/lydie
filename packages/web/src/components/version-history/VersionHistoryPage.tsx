import { ArrowLeftRegular, ClockRegular, PersonRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

import { useDocumentVersions, type Version } from "@/hooks/use-document-versions";

import { VersionPreviewEditor } from "./VersionPreviewEditor";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

interface Props {
  doc: DocumentType;
  versions: Version[];
  organizationId: string;
  organizationSlug: string;
}

export function VersionHistoryPage({ doc, versions, organizationId, organizationSlug }: Props) {
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(versions[0] || null);
  const [versionToRestore, setVersionToRestore] = useState<Version | null>(null);
  const [restoreDescription, setRestoreDescription] = useState("");

  const { restoreVersion, isLoading } = useDocumentVersions({
    documentId: doc.id,
    organizationId,
  });

  const handleRestore = async () => {
    if (!versionToRestore) return;

    try {
      await restoreVersion(versionToRestore, restoreDescription || undefined);
      setVersionToRestore(null);
      setRestoreDescription("");
      // Reload to pick up the restored state
      window.location.reload();
    } catch (error) {
      console.error("Failed to restore version:", error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Link
            to="/w/$organizationSlug/$id"
            params={{ organizationSlug, id: doc.id }}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeftRegular className="h-5 w-5" />
          </Link>
          <div>
            <Heading level={2} className="text-base font-medium">
              Version History
            </Heading>
            <p className="text-sm text-gray-500">{doc.title}</p>
          </div>
        </div>

        {selectedVersion && (
          <div className="flex items-center gap-2">
            <Button
              intent="secondary"
              size="sm"
              onPress={() => setVersionToRestore(selectedVersion)}
            >
              Restore This Version
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Editor Preview */}
        <div className="flex-1 overflow-auto p-8 bg-gray-50">
          {selectedVersion ? (
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 min-h-[600px]">
              <VersionPreviewEditor yjsState={selectedVersion.yjs_state} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Select a version to preview</p>
            </div>
          )}
        </div>

        {/* Right: Version List */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-auto">
          <div className="p-4 border-b border-gray-200">
            <Heading level={3} className="text-sm font-medium text-gray-700">
              All Versions
            </Heading>
            <p className="text-xs text-gray-500 mt-1">{versions.length} versions saved</p>
          </div>

          <div className="divide-y divide-gray-100">
            {versions.map((version, index) => (
              <button
                key={version.id}
                onClick={() => setSelectedVersion(version)}
                className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                  selectedVersion?.id === version.id
                    ? "bg-blue-50 border-l-2 border-l-blue-500"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Version {version.version_number}
                      {index === 0 && (
                        <span className="ml-2 text-xs text-blue-600 font-normal">Latest</span>
                      )}
                    </p>
                    {version.change_description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {version.change_description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <ClockRegular className="h-3 w-3" />
                    {formatDistanceToNow(version.created_at, { addSuffix: true })}
                  </span>
                  {version.user && (
                    <span className="flex items-center gap-1">
                      <PersonRegular className="h-3 w-3" />
                      {version.user.name}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {versionToRestore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[400px] max-w-[90vw]">
            <Heading level={3} className="text-lg font-medium mb-2">
              Restore Version
            </Heading>
            <p className="text-sm text-gray-500 mb-4">
              This will restore the document to Version {versionToRestore.version_number}. Your
              current version will be saved as a backup.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={restoreDescription}
                onChange={(e) => setRestoreDescription(e.target.value)}
                placeholder="Why are you restoring this version?"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                intent="secondary"
                size="sm"
                onPress={() => {
                  setVersionToRestore(null);
                  setRestoreDescription("");
                }}
              >
                Cancel
              </Button>
              <Button intent="primary" size="sm" onPress={handleRestore} isDisabled={isLoading}>
                Restore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
