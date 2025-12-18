import { useAuthenticatedApi } from "@/services/api";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { RadioGroup, Radio } from "@/components/generic/RadioGroup";
import { Input, Label } from "@/components/generic/Field";

export type ShopifyLinkConfig = {
  resourceType: string;
  resourceId: string;
  resourceFullName: string;
};

export type ShopifyFormProps = {
  connectionId: string;
  organizationId: string;
  onCreate: (name: string, config: ShopifyLinkConfig) => Promise<void>;
  onCancel: () => void;
};

export function ShopifyForm({
  connectionId,
  organizationId,
  onCreate,
  onCancel,
}: ShopifyFormProps) {
  const { createClient } = useAuthenticatedApi();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [resources, setResources] = useState<
    Array<{
      id: string;
      name: string;
      fullName: string;
      metadata?: { type?: string };
    }>
  >([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [linkName, setLinkName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const loadResources = async () => {
      setIsLoading(true);
      try {
        const client = await createClient();
        const res = await client.internal.integrations[":connectionId"].resources
          .$get({
            param: { connectionId },
          })
          .then((r: Response) => r.json());

        if (cancelled) return;

        if (!res || ("error" in res && res.error)) {
          toast.error(
            "error" in res
              ? `Failed to load resources: ${res.error}`
              : "Failed to load resources"
          );
          return;
        }

        const resourcesList = (res.resources || []) as Array<{
          id: string;
          name: string;
          fullName: string;
          metadata?: { type?: string };
        }>;

        setResources(resourcesList);
      } catch (error) {
        console.error("Failed to load resources:", error);
        toast.error("Failed to load available resources from Shopify");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (connectionId) {
      loadResources();
    }

    return () => {
      cancelled = true;
    };
  }, [connectionId, createClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedResourceId) {
      toast.error("Please select a resource to sync");
      return;
    }

    const selectedResource = resources.find((r) => r.id === selectedResourceId);
    if (!selectedResource) return;

    setIsSaving(true);
    try {
      const finalLinkName = linkName || selectedResource.name;

      const config: ShopifyLinkConfig = {
        resourceType: selectedResource.metadata?.type || "unknown",
        resourceId: selectedResource.id,
        resourceFullName: selectedResource.fullName,
      };

      await onCreate(finalLinkName, config);
    } catch (error) {
      console.error("Failed to save link:", error);
      toast.error("Failed to save resource configuration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Add Shopify Resource</h3>
        <p className="text-sm text-gray-600 mt-1">
          Select a Shopify resource to sync documents to.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Resource Type</Label>
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
              {resources.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No syncable resources found.
                </div>
              ) : (
                <RadioGroup
                  value={selectedResourceId}
                  onChange={(val) => {
                    setSelectedResourceId(val);
                    const res = resources.find((r) => r.id === val);
                    if (res && !linkName) {
                      setLinkName(res.name);
                    }
                  }}
                >
                  {resources.map((resource) => (
                    <Radio
                      key={resource.id}
                      value={resource.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {resource.name}
                        </span>
                        <span className="text-xs text-gray-500 capitalize">
                          {resource.metadata?.type?.replace("_", " ") ||
                            resource.fullName}
                        </span>
                      </div>
                    </Radio>
                  ))}
                </RadioGroup>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="link-name">Name (Optional)</Label>
            <Input
              id="link-name"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="e.g. Store Pages"
            />
            <p className="text-xs text-gray-500">
              A friendly name for this sync connection.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || isSaving || !selectedResourceId}
          className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Add Resource"}
        </button>
      </div>
    </form>
  );
}

