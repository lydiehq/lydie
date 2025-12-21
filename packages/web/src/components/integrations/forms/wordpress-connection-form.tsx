import { useAppForm } from "@/hooks/use-app-form";
import { useAuthenticatedApi } from "@/services/api";
import { toast } from "sonner";
import { Label } from "@/components/generic/Field";
import { Input } from "react-aria-components";
import { TextField } from "react-aria-components";
import { Button } from "@/components/generic/Button";

export type WordPressConnectionConfig = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
};

export type WordPressConnectionFormProps = {
  organizationId: string;
  integrationType: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export function WordPressConnectionForm({
  organizationId,
  integrationType,
  onSuccess,
  onCancel,
}: WordPressConnectionFormProps) {
  const { createClient } = useAuthenticatedApi();

  const form = useAppForm({
    defaultValues: {
      siteUrl: "",
      username: "",
      applicationPassword: "",
    },
    onSubmit: async (values) => {
      try {
        const client = await createClient();
        const response = await client.internal.integrations[":type"].connect
          .$post({
            param: { type: integrationType },
            json: {
              organizationId,
              config: {
                siteUrl: values.value.siteUrl.trim(),
                username: values.value.username.trim(),
                applicationPassword: values.value.applicationPassword.trim(),
              },
            },
          })
          .then((res: Response) => res.json());

        if ("error" in response) {
          toast.error(response.error);
          return;
        }

        toast.success("WordPress connected successfully!");
        onSuccess();
      } catch (error) {
        console.error("Failed to connect WordPress:", error);
        toast.error(
          "Failed to connect WordPress. Please check your credentials."
        );
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
        <h3 className="text-lg font-medium text-gray-900">Connect WordPress</h3>
        <p className="text-sm text-gray-600 mt-1">
          Enter your WordPress site credentials to connect.
        </p>
      </div>

      <div className="flex flex-col gap-y-3">
        <form.AppField
          name="siteUrl"
          children={(field) => (
            <div className="flex flex-col gap-y-1">
              <Label>Site URL</Label>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="https://your-site.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        />

        <form.AppField
          name="username"
          children={(field) => (
            <div className="flex flex-col gap-y-1">
              <Label>Username</Label>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="admin"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        />

        <form.AppField
          name="applicationPassword"
          children={(field) => (
            <div className="flex flex-col gap-y-1">
              <Label>Application Password</Label>
              <Input
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="xxxx xxxx xxxx xxxx"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Generate this in your WordPress User Profile settings under
                Application Passwords.
              </p>
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        />
      </div>

      <div className="flex justify-end gap-1.5 mt-2">
        <Button type="button" onPress={onCancel} intent="secondary">
          Cancel
        </Button>
        <Button type="submit" isDisabled={form.state.isSubmitting}>
          {form.state.isSubmitting ? "Connecting..." : "Connect"}
        </Button>
      </div>
    </form>
  );
}
