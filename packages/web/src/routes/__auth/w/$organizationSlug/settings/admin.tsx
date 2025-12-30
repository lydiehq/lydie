import { Button } from "@/components/generic/Button";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useOrganization } from "@/context/organization.context";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { Download } from "lucide-react";
import { useZero } from "@/services/zero";
import { queries } from "@lydie/zero/queries";
import JSZip from "jszip";
import { serializeToMarkdown } from "@lydie/core/serialization/markdown";
import type { ContentNode } from "@lydie/core/content";
import { useAuth } from "@/context/auth.context";
import { isAdmin } from "@/utils/admin";
import { Card } from "@/components/layout/Card";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/admin"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const z = useZero();
  const [isExporting, setIsExporting] = useState(false);

  // Check if user is admin
  if (!isAdmin(user)) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Admin</Heading>
        </div>
        <Separator />
        <Card className="p-8 text-center">
          <div className="text-sm font-medium text-gray-700">
            Access Denied
          </div>
          <div className="text-xs mt-1 text-gray-500">
            You do not have permission to access this page.
          </div>
        </Card>
      </div>
    );
  }

  // Query all documents for the organization
  const [documents] = useQuery(
    queries.documents.byUpdated({ organizationId: organization?.id || "" })
  );

  const handleExportDocuments = async () => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    if (!documents || documents.length === 0) {
      toast.error("No documents to export");
      return;
    }

    setIsExporting(true);
    try {
      const zip = new JSZip();

      // Create a folder structure based on document paths
      for (const doc of documents) {
        try {
          // Note: Zero queries don't sync yjs_state, so we use json_content here.
          // If the document has collaborative edits in Yjs, json_content might be outdated.
          // For the most up-to-date content, users should ensure documents are saved before exporting.
          // Convert the JSON content to markdown
          const markdown = serializeToMarkdown(doc.json_content as ContentNode);
          
          // Create a safe filename from the title
          const safeTitle = doc.title
            .replace(/[^a-z0-9]/gi, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase() || "untitled";
          
          // Use the document's slug as the filename for consistency
          const filename = `${doc.slug || safeTitle}.md`;
          
          // Add metadata header to markdown
          const metadataHeader = `---
title: ${doc.title}
slug: ${doc.slug}
created: ${new Date(doc.created_at).toISOString()}
updated: ${new Date(doc.updated_at).toISOString()}
---

`;
          
          const fullContent = metadataHeader + markdown;
          
          // Add the file to the zip
          zip.file(filename, fullContent);
        } catch (error) {
          console.error(`Error processing document ${doc.id}:`, error);
          toast.error(`Failed to process document: ${doc.title}`);
        }
      }

      // Generate the zip file
      const content = await zip.generateAsync({ type: "blob" });

      // Create a download link and trigger it
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${organization.name}-documents-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Successfully exported ${documents.length} documents`);
    } catch (error) {
      console.error("Error exporting documents:", error);
      toast.error("Failed to export documents. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Admin</Heading>
      </div>
      <Separator />

      {/* Export Documents Section */}
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-0.5">
          <Heading level={2}>Export Documents</Heading>
          <p className="text-sm/relaxed text-gray-600">
            Export all documents in your workspace as Markdown files in a
            downloadable ZIP archive.
          </p>
        </div>
        <Card className="p-6">
          <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-y-1">
                <div className="text-sm font-medium text-gray-900">
                  Export all documents
                </div>
                <div className="text-xs text-gray-600">
                  {documents
                    ? `${documents.length} document${documents.length !== 1 ? "s" : ""} available`
                    : "Loading..."}
                </div>
              </div>
              <Button
                onPress={handleExportDocuments}
                size="sm"
                intent="secondary"
                isPending={isExporting}
                isDisabled={!documents || documents.length === 0 || isExporting}
              >
                <Download className="size-3.5 mr-1" />
                {isExporting ? "Exporting..." : "Export as Markdown"}
              </Button>
            </div>
            <div className="text-xs text-gray-500 border-t border-gray-200 pt-4">
              <strong>What's included:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>All documents converted to Markdown format</li>
                <li>Metadata header with title, slug, and timestamps</li>
                <li>Files organized in a ZIP archive</li>
                <li>Compatible with most Markdown editors and note-taking apps</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Separator />

      {/* Future Admin Features Placeholder */}
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-0.5">
          <Heading level={2}>Additional Admin Features</Heading>
          <p className="text-sm/relaxed text-gray-600">
            More administrative features will be added here in the future.
          </p>
        </div>
      </div>
    </div>
  );
}

