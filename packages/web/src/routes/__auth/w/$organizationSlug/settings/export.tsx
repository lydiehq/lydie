import {
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
} from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuthenticatedApi } from "@/services/api";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/export")({
  component: RouteComponent,
});

interface ExportJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  documentCount?: number;
  createdAt: string;
  error?: string;
}

function RouteComponent() {
  useDocumentTitle("Export");

  const { createClient } = useAuthenticatedApi();
  const [isExporting, setIsExporting] = useState(false);
  const [currentJob, setCurrentJob] = useState<ExportJob | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setCurrentJob(null);

    try {
      const client = await createClient();
      
      // Start export
      const response = await client.internal["workspace-export"]
        .$post()
        .then((res) => res.json());

      if (response.success) {
        setCurrentJob({
          id: response.exportId,
          status: "completed",
          downloadUrl: response.downloadUrl,
          documentCount: response.documentCount,
          createdAt: new Date().toISOString(),
        });
        toast.success(`Export completed! ${response.documentCount} documents exported.`);
      } else {
        throw new Error("Export failed");
      }
    } catch (error) {
      console.error("Export error:", error);
      setCurrentJob({
        id: "",
        status: "failed",
        error: error instanceof Error ? error.message : "Export failed",
        createdAt: new Date().toISOString(),
      });
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (currentJob?.downloadUrl) {
      window.open(currentJob.downloadUrl, "_blank");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export Workspace</h1>
        <p className="text-gray-600 mt-2">
          Export all documents in your workspace as Markdown files with YAML frontmatter.
          The export includes document properties, database schemas, and page configuration.
        </p>
      </div>

      {/* Export Section */}
      <div className="p-6 border border-gray-200 rounded-lg bg-white">
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <ArrowDownloadRegular className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">Export to Markdown</h3>
              <p className="text-gray-600 mt-1">
                All documents will be exported as Markdown files with YAML frontmatter containing:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
                <li>Document title and slug</li>
                <li>Document properties (database fields)</li>
                <li>Child schema configuration (for database pages)</li>
                <li>Page display settings</li>
                <li>Original document ID for re-importing</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              onPress={handleExport}
              isPending={isExporting}
              isDisabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export Workspace"}
            </Button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {currentJob && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Export Result</h2>

          <div
            className={`p-4 rounded-lg border ${
              currentJob.status === "completed"
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-start space-x-3">
              {currentJob.status === "completed" ? (
                <CheckmarkCircleRegular className="h-5 w-5 text-green-500 mt-0.5" />
              ) : (
                <ErrorCircleRegular className="h-5 w-5 text-red-500 mt-0.5" />
              )}

              <div className="flex-1">
                {currentJob.status === "completed" ? (
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-green-900">Export Completed</h4>
                      <p className="text-sm text-green-700">
                        Successfully exported {currentJob.documentCount} document(s)
                      </p>
                    </div>

                    {currentJob.downloadUrl && (
                      <Button size="sm" onPress={handleDownload}>
                        Download Export
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium text-red-900">Export Failed</h4>
                    <p className="text-sm text-red-700">{currentJob.error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-2">About Exports</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Exports are stored temporarily and available for 7 days</li>
          <li>Each document is exported as a separate Markdown file</li>
          <li>Folder structure is preserved in the file paths</li>
          <li>Exported files can be imported back using the Import feature</li>
        </ul>
      </div>
    </div>
  );
}
