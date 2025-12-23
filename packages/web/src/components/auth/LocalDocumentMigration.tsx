import { Dialog } from "@/components/generic/Dialog";
import { Button } from "@/components/generic/Button";
import { Heading } from "@/components/generic/Heading";
import { LOCAL_ORG_ID } from "@/lib/local-organization";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useZero } from "@/services/zero";
import { mutators } from "@lydie/zero/mutators";
import { toast } from "sonner";
import { useState } from "react";
import { FileText, FolderIcon } from "lucide-react";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  targetOrganizationId: string;
  targetOrganizationName: string;
};

export function LocalDocumentMigration({
  isOpen,
  onOpenChange,
  targetOrganizationId,
  targetOrganizationName,
}: Props) {
  const z = useZero();
  const [isMigrating, setIsMigrating] = useState(false);

  const [localData] = useQuery(
    queries.organizations.documentsAndFolders({
      organizationId: LOCAL_ORG_ID,
    })
  );

  const documents = localData?.documents || [];
  const folders = localData?.folders || [];

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      // Migrate folders first
      for (const folder of folders) {
        z.mutate(
          mutators.folder.update({
            folderId: folder.id,
            organizationId: targetOrganizationId,
            name: folder.name,
            parentId: folder.parent_id,
          })
        );
      }

      // Then migrate documents
      for (const doc of documents) {
        z.mutate(
          mutators.document.update({
            documentId: doc.id,
            organizationId: targetOrganizationId,
            title: doc.title,
            folderId: doc.folder_id,
            jsonContent: doc.json_content,
            indexStatus: "outdated",
          })
        );
      }

      toast.success(
        `Successfully migrated ${documents.length} documents and ${folders.length} folders`
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Migration failed:", error);
      toast.error("Failed to migrate documents. Please try again.");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleKeepLocal = () => {
    onOpenChange(false);
  };

  const handleDeleteLocal = async () => {
    setIsMigrating(true);
    try {
      // Delete all local documents
      for (const doc of documents) {
        z.mutate(
          mutators.document.delete({
            documentId: doc.id,
            organizationId: LOCAL_ORG_ID,
          })
        );
      }

      // Delete all local folders
      for (const folder of folders) {
        z.mutate(
          mutators.folder.delete({
            folderId: folder.id,
            organizationId: LOCAL_ORG_ID,
          })
        );
      }

      toast.success("Local documents deleted");
      onOpenChange(false);
    } catch (error) {
      console.error("Deletion failed:", error);
      toast.error("Failed to delete local documents");
    } finally {
      setIsMigrating(false);
    }
  };

  if (documents.length === 0 && folders.length === 0) {
    return null;
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <div className="p-6 space-y-4">
        <Heading level={2}>Migrate Your Local Documents?</Heading>
        <p className="text-sm text-gray-600">
          You have {documents.length} document(s) and {folders.length} folder(s)
          stored locally. Would you like to migrate them to your{" "}
          <strong>{targetOrganizationName}</strong> workspace?
        </p>

        <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
          <div className="space-y-2">
            {folders.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Folders ({folders.length})
                </p>
                {folders.slice(0, 5).map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <FolderIcon className="size-4 text-gray-400" />
                    <span className="truncate">{folder.name}</span>
                  </div>
                ))}
                {folders.length > 5 && (
                  <p className="text-xs text-gray-500 pl-6">
                    ... and {folders.length - 5} more
                  </p>
                )}
              </div>
            )}
            {documents.length > 0 && (
              <div className="space-y-1 mt-3">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Documents ({documents.length})
                </p>
                {documents.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-sm">
                    <FileText className="size-4 text-gray-400" />
                    <span className="truncate">
                      {doc.title || "Untitled document"}
                    </span>
                  </div>
                ))}
                {documents.length > 5 && (
                  <p className="text-xs text-gray-500 pl-6">
                    ... and {documents.length - 5} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onPress={handleMigrate}
            isDisabled={isMigrating}
            className="w-full"
          >
            {isMigrating ? "Migrating..." : `Migrate to ${targetOrganizationName}`}
          </Button>
          <div className="flex gap-2">
            <Button
              intent="secondary"
              onPress={handleKeepLocal}
              isDisabled={isMigrating}
              className="flex-1"
            >
              Keep Local
            </Button>
            <Button
              intent="danger"
              onPress={handleDeleteLocal}
              isDisabled={isMigrating}
              className="flex-1"
            >
              Delete Local
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

