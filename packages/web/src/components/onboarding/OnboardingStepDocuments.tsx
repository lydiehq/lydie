import { Button } from "@/components/generic/Button";
import { DocumentIcon, FolderIcon, SearchIcon } from "@/icons";
import { useNavigate } from "@tanstack/react-router";
import { useOrganization } from "@/context/organization.context";

export function OnboardingStepDocuments() {
  const navigate = useNavigate();
  const { organization } = useOrganization();

  const handleExploreDocuments = () => {
    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug: organization.slug },
    });
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center gap-x-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <DocumentIcon className="size-6 text-gray-700" />
        </div>
        <span className="text-lg font-medium text-gray-900">Documents</span>
      </div>
      <p className="text-gray-700 text-sm/relaxed">
        Your workspace is organized with documents. Create, organize, and manage all your content in one place. Documents can be nested in folders and linked together.
      </p>
      <div className="flex flex-col gap-y-3">
        <div className="flex items-start gap-x-3">
          <div className="p-1.5 bg-gray-50 rounded mt-0.5">
            <FolderIcon className="size-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Organize with folders</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Create folders to group related documents together
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-3">
          <div className="p-1.5 bg-gray-50 rounded mt-0.5">
            <SearchIcon className="size-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Search and discover</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Quickly find any document using search
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-3">
          <div className="p-1.5 bg-gray-50 rounded mt-0.5">
            <DocumentIcon className="size-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Rich editing</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Edit documents with markdown support and formatting
            </p>
          </div>
        </div>
      </div>
      <Button
        onPress={handleExploreDocuments}
        intent="primary"
        size="sm"
      >
        Explore documents
      </Button>
    </div>
  );
}
