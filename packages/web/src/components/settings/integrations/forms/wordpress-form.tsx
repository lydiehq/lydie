import { toast } from "sonner";

import { Label } from "@lydie/ui/components/generic/Field";
import { Radio, RadioGroup } from "@lydie/ui/components/generic/RadioGroup";
import { useAppForm } from "@/hooks/use-app-form";

export type WordPressLinkConfig = {
  type: "pages" | "posts";
};

export type WordPressFormProps = {
  connectionId: string;
  organizationId: string;
  onCreate: (name: string, config: WordPressLinkConfig) => Promise<void>;
  onCancel: () => void;
};

const RESOURCE_TYPES = [
  { value: "pages", label: "Pages", description: "Sync WordPress pages" },
  { value: "posts", label: "Posts", description: "Sync WordPress blog posts" },
] as const;

export function WordPressForm({
  connectionId,
  organizationId,
  onCreate,
  onCancel,
}: WordPressFormProps) {
  const form = useAppForm({
    defaultValues: {
      resourceType: "" as "pages" | "posts" | "",
      linkName: "",
    },
    onSubmit: async (values) => {
      try {
        if (!values.value.resourceType) {
          toast.error("Please select a resource type");
          return;
        }

        const selectedType = RESOURCE_TYPES.find((t) => t.value === values.value.resourceType);
        if (!selectedType) {
          toast.error("Invalid resource type");
          return;
        }

        const name = values.value.linkName.trim() || selectedType.label;

        const config: WordPressLinkConfig = {
          type: values.value.resourceType as "pages" | "posts",
        };

        await onCreate(name, config);
      } catch (error) {
        console.error("Failed to create WordPress link:", error);
        toast.error("Failed to create link");
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-y-4"
    >
      <div>
        <h3 className="text-lg font-medium text-gray-900">Add WordPress Link</h3>
        <p className="text-sm text-gray-600 mt-1">
          Select whether to sync WordPress pages or posts.
        </p>
      </div>

      <div className="flex flex-col gap-y-3">
        <form.AppField
          name="resourceType"
          children={(field) => (
            <div className="flex flex-col gap-y-2">
              <Label>Resource Type</Label>
              <RadioGroup
                value={field.state.value}
                onChange={(val) => field.handleChange(val as "pages" | "posts")}
              >
                {RESOURCE_TYPES.map((type) => (
                  <Radio
                    key={type.value}
                    value={type.value}
                    className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer border border-gray-200"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{type.label}</span>
                      <span className="text-xs text-gray-500">{type.description}</span>
                    </div>
                  </Radio>
                ))}
              </RadioGroup>
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        />

        <form.AppField
          name="linkName"
          children={(field) => (
            <field.TextField
              label="Link name (optional)"
              placeholder="e.g. Blog Posts"
              description="Display name for this link. Defaults to the resource type."
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-1.5 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={form.state.isSubmitting}
          className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          {form.state.isSubmitting ? "Creating..." : "Create Link"}
        </button>
      </div>
    </form>
  );
}
