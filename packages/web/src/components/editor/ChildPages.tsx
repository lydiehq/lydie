import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useNavigate } from "@tanstack/react-router";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { File, Plus } from "lucide-react";
import { Button } from "@/components/generic/Button";
import { useOrganization } from "@/context/organization.context";

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

  const navigate = useNavigate();
  const { createDocument } = useDocumentActions();
  const { organization } = useOrganization();

  const children = doc?.children || [];

  const handleCreateChildPage = async () => {
    await createDocument(undefined, documentId);
  };

  if (children.length === 0) {
    return (
      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900">Child pages</h3>
          <Button
            size="sm"
            variant="ghost"
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
    <div className="mt-12 pt-8 border-t border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">Child pages</h3>
        <Button
          size="sm"
          variant="ghost"
          onPress={handleCreateChildPage}
          className="text-gray-600 hover:text-gray-900"
        >
          <Plus className="size-4 mr-1" />
          Add page
        </Button>
      </div>
      <div className="space-y-1">
        {children.map((child) => (
          <Button
            key={child.id}
            variant="ghost"
            className="w-full justify-start text-left text-gray-700 hover:bg-gray-50"
            onPress={() => {
              navigate({
                to: "/w/$organizationSlug/$id",
                params: {
                  id: child.id,
                  organizationSlug: organization?.slug || "",
                },
                from: "/w/$organizationSlug/$id",
              });
            }}
          >
            <File className="size-4 mr-2 text-gray-400" />
            <span className="truncate">
              {child.title || "Untitled document"}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

