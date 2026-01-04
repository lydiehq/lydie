import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { File, Plus } from "lucide-react";
import { Button } from "@/components/generic/Button";
import { Link } from "../generic/Link";

type Props = {
  documentId: string;
  organizationId: string;
};

export function ChildPages({ documentId, organizationId }: Props) {
  const [doc] = useQuery(
    queries.documents.byId({
      organizationId,
      documentId,
    })
  );

  const { createDocument } = useDocumentActions();

  const children = doc?.children || [];

  const handleCreateChildPage = async () => {
    createDocument(documentId);
  };

  if (children.length === 0) {
    return (
      <div className="border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900">Child pages</h3>
          <Button
            size="sm"
            intent="ghost"
            onPress={handleCreateChildPage}
            className="text-gray-600 hover:text-gray-900"
          >
            <Plus className="size-4 mr-1" />
            Add page
          </Button>
        </div>
        <p className="text-sm text-gray-500">
          No child pages yet. Create a page to organize content hierarchically.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">Child pages</h3>
        <Button
          size="sm"
          intent="ghost"
          onPress={handleCreateChildPage}
          className="text-gray-600 hover:text-gray-900"
        >
          <Plus className="size-4 mr-1" />
          Add page
        </Button>
      </div>
      <div className="space-y-1">
        {children.map((child) => (
          <Link
            key={child.id}
            to={`/w/$organizationSlug/${child.id}`}
            from="/w/$organizationSlug"
            className="px-2 py-1.5 rounded-md hover:bg-black/5 transition-all duration-75 flex justify-between"
          >
            <div className="flex gap-x-1.5 items-center">
              <File className="size-3.5 text-gray-400" />
              <span className="truncate text-sm font-medium text-gray-600">
                {child.title || "Untitled document"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
