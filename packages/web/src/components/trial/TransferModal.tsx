import { useState, useEffect } from "react";
import { Modal } from "../generic/Modal";
import { Dialog } from "../generic/Dialog";
import { Button } from "../generic/Button";
import { Heading } from "react-aria-components";
import { Separator } from "../generic/Separator";
import type { Zero } from "@rocicorp/zero";
import {
  getTrialData,
  transferTrialData,
  clearTrialData,
  type TrialData,
} from "@/utils/trial-transfer";
import { FileText, Folder, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  trialZero: Zero;
  authZero: Zero;
  targetOrganizationId: string;
  onTransferComplete?: () => void;
};

type TransferState = "idle" | "loading" | "transferring" | "success" | "error";

export function TransferModal({
  isOpen,
  onOpenChange,
  trialZero,
  authZero,
  targetOrganizationId,
  onTransferComplete,
}: Props) {
  const [trialData, setTrialData] = useState<TrialData | null>(null);
  const [transferState, setTransferState] = useState<TransferState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Load trial data when modal opens
  useEffect(() => {
    if (isOpen && transferState === "idle") {
      loadTrialData();
    }
  }, [isOpen]);

  const loadTrialData = async () => {
    setTransferState("loading");
    setError(null);
    try {
      const data = await getTrialData(trialZero);
      setTrialData(data);
      setTransferState("idle");
    } catch (err) {
      console.error("Failed to load trial data:", err);
      setError("Failed to load your trial data. Please try again.");
      setTransferState("error");
    }
  };

  const handleTransfer = async () => {
    if (!trialData) return;

    setTransferState("transferring");
    setError(null);

    try {
      await transferTrialData(trialData, authZero, targetOrganizationId);
      await clearTrialData(trialZero);
      setTransferState("success");
      toast.success("Your documents have been transferred successfully!");

      // Close modal and notify parent after a short delay
      setTimeout(() => {
        onOpenChange(false);
        onTransferComplete?.();
      }, 1500);
    } catch (err) {
      console.error("Transfer failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to transfer your data. Please try again."
      );
      setTransferState("error");
      toast.error("Failed to transfer your documents");
    }
  };

  const handleStartFresh = async () => {
    try {
      await clearTrialData(trialZero);
      toast.success("Starting fresh with a clean workspace!");
      onOpenChange(false);
      onTransferComplete?.();
    } catch (err) {
      console.error("Failed to clear trial data:", err);
      // Continue anyway - not critical
      onOpenChange(false);
      onTransferComplete?.();
    }
  };

  const handleClose = () => {
    if (transferState === "transferring") return; // Don't allow closing during transfer
    onOpenChange(false);
  };

  const documentCount = trialData?.documents.length || 0;
  const folderCount = trialData?.folders.length || 0;
  const hasData = documentCount > 0 || folderCount > 0;

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose} isDismissable={transferState !== "transferring"}>
      <Dialog>
        <div className="p-6 max-w-md">
          {/* Header */}
          <div className="mb-4">
            <Heading className="text-xl font-semibold text-gray-900 mb-2">
              Transfer Your Trial Data
            </Heading>
            <p className="text-sm text-gray-600">
              You have documents from your trial session. Would you like to
              transfer them to your new workspace?
            </p>
          </div>

          <Separator className="mb-4" />

          {/* Loading State */}
          {transferState === "loading" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="size-8 text-gray-400 animate-spin mb-3" />
              <p className="text-sm text-gray-600">Loading your trial data...</p>
            </div>
          )}

          {/* Success State */}
          {transferState === "success" && (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="size-12 text-green-500 mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">
                Transfer Complete!
              </p>
              <p className="text-sm text-gray-600">
                Your documents are now in your workspace.
              </p>
            </div>
          )}

          {/* Error State */}
          {transferState === "error" && error && (
            <div className="flex flex-col items-center justify-center py-8">
              <XCircle className="size-12 text-red-500 mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">
                Transfer Failed
              </p>
              <p className="text-sm text-gray-600 text-center">{error}</p>
            </div>
          )}

          {/* Idle State - Show Data Summary */}
          {(transferState === "idle" || transferState === "transferring") &&
            trialData && (
              <>
                {hasData ? (
                  <div className="space-y-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <FileText className="size-5 text-gray-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {documentCount}{" "}
                            {documentCount === 1 ? "Document" : "Documents"}
                          </p>
                          {documentCount > 0 && (
                            <ul className="mt-2 space-y-1">
                              {trialData.documents
                                .slice(0, 3)
                                .map((doc) => (
                                  <li
                                    key={doc.id}
                                    className="text-xs text-gray-600 truncate"
                                  >
                                    • {doc.title || "Untitled"}
                                  </li>
                                ))}
                              {documentCount > 3 && (
                                <li className="text-xs text-gray-500">
                                  ... and {documentCount - 3} more
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      </div>

                      {folderCount > 0 && (
                        <>
                          <Separator className="my-3" />
                          <div className="flex items-start gap-3">
                            <Folder className="size-5 text-gray-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {folderCount}{" "}
                                {folderCount === 1 ? "Folder" : "Folders"}
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {transferState === "transferring" && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 justify-center py-2">
                        <Loader2 className="size-4 animate-spin" />
                        <span>Transferring your data...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-600">
                      You don't have any trial data to transfer.
                    </p>
                  </div>
                )}

                {/* Actions */}
                {hasData && (
                  <div className="flex gap-3">
                    <Button
                      intent="secondary"
                      className="flex-1"
                      onPress={handleStartFresh}
                      isDisabled={transferState === "transferring"}
                    >
                      Start Fresh
                    </Button>
                    <Button
                      intent="primary"
                      className="flex-1"
                      onPress={handleTransfer}
                      isDisabled={transferState === "transferring"}
                      isPending={transferState === "transferring"}
                    >
                      Transfer Data
                    </Button>
                  </div>
                )}

                {!hasData && (
                  <div className="flex justify-end">
                    <Button intent="primary" onPress={handleClose}>
                      Continue
                    </Button>
                  </div>
                )}
              </>
            )}

          {/* Error State Actions */}
          {transferState === "error" && (
            <div className="flex gap-3 mt-4">
              <Button
                intent="secondary"
                className="flex-1"
                onPress={handleClose}
              >
                Cancel
              </Button>
              <Button intent="primary" className="flex-1" onPress={loadTrialData}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

