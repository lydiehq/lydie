import { Button } from "@/components/generic/Button";
import { PuzzleIcon, CodeIcon, GlobeIcon } from "@/icons";
import { useNavigate } from "@tanstack/react-router";
import { useOrganization } from "@/context/organization.context";

export function OnboardingStepIntegrations() {
  const navigate = useNavigate();
  const { organization } = useOrganization();

  const handleGoToIntegrations = () => {
    navigate({
      to: "/w/$organizationSlug/settings/integrations",
      params: { organizationSlug: organization.slug },
    });
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center gap-x-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <PuzzleIcon className="size-6 text-gray-700" />
        </div>
        <span className="text-lg font-medium text-gray-900">Integrations</span>
      </div>
      <p className="text-gray-700 text-sm/relaxed">
        Connect your favorite tools to sync content automatically. Integrate with GitHub, Linear, and other services to keep your documents in sync.
      </p>
      <div className="flex flex-col gap-y-3">
        <div className="flex items-start gap-x-3">
          <div className="p-1.5 bg-gray-50 rounded mt-0.5">
            <CodeIcon className="size-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">GitHub integration</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Sync repositories, issues, and pull requests
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-3">
          <div className="p-1.5 bg-gray-50 rounded mt-0.5">
            <GlobeIcon className="size-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Linear integration</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Sync issues and projects from Linear
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-3">
          <div className="p-1.5 bg-gray-50 rounded mt-0.5">
            <PuzzleIcon className="size-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">More integrations</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Connect with other tools and services
            </p>
          </div>
        </div>
      </div>
      <Button
        onPress={handleGoToIntegrations}
        intent="primary"
        size="sm"
      >
        View integrations
      </Button>
    </div>
  );
}
