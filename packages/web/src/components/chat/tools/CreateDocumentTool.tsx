import { Card } from "@/components/layout/Card";
import { FileText, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface CreateDocumentToolProps {
  tool: {
    toolCallId: string;
    input?: {
      title?: string;
      content?: string;
    };
    output?: {
      id: string;
      title: string;
      snippet?: string;
    };
  };
  organizationId: string;
}

export function CreateDocumentTool({
  tool,
  organizationId,
}: CreateDocumentToolProps) {
  const { output, input } = tool;
  const title = output?.title || input?.title || "Untitled Document";
  const snippet = output?.snippet || input?.content || "";

  // Strip HTML from snippet for preview
  const plainSnippet = snippet
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150)
    .concat(snippet.length > 150 ? "..." : "");

  return (
    <Card className="w-full max-w-sm border border-gray-200 overflow-hidden my-2">
      <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        <div className="bg-white p-1.5 rounded border border-gray-200">
          <FileText size={16} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {title}
          </h3>
          <p className="text-xs text-gray-500">Document Created</p>
        </div>
      </div>

      {plainSnippet && (
        <div className="p-3 text-xs text-gray-600 bg-white border-b border-gray-100">
          {plainSnippet}
        </div>
      )}

      {output?.id && (
        <div className="p-2 bg-gray-50 flex justify-end">
          <Link
            to="/w/$organizationId/$id"
            params={{ organizationId, id: output.id }}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            Open Document
            <ExternalLink size={12} />
          </Link>
        </div>
      )}
    </Card>
  );
}

