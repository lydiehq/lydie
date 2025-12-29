import { createFileRoute } from "@tanstack/react-router";
import { Form } from "react-aria-components";
import { useAppForm } from "@/hooks/use-app-form";
import { Button } from "@/components/generic/Button";
import { Heading } from "@/components/generic/Heading";
import { useZero } from "@/services/zero";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { createId } from "@lydie/core/id";
import { toast } from "sonner";
import { slugify } from "@lydie/core/utils";
import { useQueryClient } from "@tanstack/react-query";
import { revalidateSession } from "@/lib/auth/session";
import { mutators } from "@lydie/zero/mutators";

export const Route = createFileRoute("/__auth/onboarding/")({
  component: RouteComponent,
});

function RouteComponent() {
  const z = useZero();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useAppForm({
    defaultValues: {
      workspaceName: "",
    },
    onSubmit: async (values) => {
      try {
        const id = createId();
        const slug = slugify(values.value.workspaceName);

        const write = z.mutate(
          mutators.organization.create({
            id,
            name: values.value.workspaceName,
            slug,
          })
        );

        // Wait for the server to exist in the database.
        await write.server;

        await revalidateSession(queryClient);
        await router.invalidate();

        navigate({
          to: "/w/$organizationSlug",
          params: { organizationSlug: slug },
        });

        toast.success("Workspace created successfully");
      } catch (error) {
        console.error("Failed to create workspace:", error);
        toast.error("Failed to create workspace");
      }
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm">
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-y-8"
        >
          <div className="gap-y-2 flex flex-col">
            <Heading>Welcome to Lydie</Heading>
            <p className="text-gray-600">Let's create your workspace</p>
          </div>

          <div className="gap-y-4 flex flex-col">
            <form.AppField
              name="workspaceName"
              children={(field) => (
                <field.TextField
                  autoFocus
                  label="Workspace Name"
                  placeholder="My Workspace"
                  description="This will be the name of your organization"
                />
              )}
            />

            <Button
              type="submit"
              isPending={form.state.isSubmitting}
              className="w-full"
            >
              {form.state.isSubmitting
                ? "Creating workspace..."
                : "Create Workspace"}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
