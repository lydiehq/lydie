import { Button } from "@/components/generic/Button";
import { useZero } from "@/services/zero";
import { createId } from "@lydie/core/id";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppForm } from "@/hooks/use-app-form";
import { toast } from "sonner";
import { Form } from "react-aria-components";
import { useOrganization } from "@/context/organization.context";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";
import { mutators } from "@lydie/zero/mutators";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/components"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const z = useZero();
  const { organization } = useOrganization();
  const { session } = useAuth();

  const form = useAppForm({
    defaultValues: {
      name: "",
      properties: [{ key: "", type: "string" }],
    },
    onSubmit: async (values) => {
      const properties = Object.fromEntries(
        values.properties.map((prop) => [prop.key, { type: prop.type }])
      );

      const id = createId();

      z.mutate(
        mutators.documentComponent.create({
          id,
          name: values.name,
          organizationId: organization.id,
          properties,
        })
      );

      toast.success("Block created successfully");
    },
  });

  const [blocks] = useQuery(
    queries.components.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Components</Heading>
      </div>
      <Separator />
      <div className="">
        <div className="flex flex-col gap-y-2">
          <h2 className="text-md/none font-medium">Create Component</h2>
          <p className="text-sm/relaxed text-gray-700">
            Create reusable components for your documents.
          </p>
        </div>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.AppField
            name="name"
            children={(field) => (
              <field.TextField
                label="Block Name"
                placeholder="Enter block name"
              />
            )}
          />

          {/* Properties section would need to be implemented with custom field arrays */}
          {/* This part would require additional work to properly implement field arrays with Tanstack Form */}

          <Button type="submit">Create Block</Button>
        </Form>

        <ul>
          {blocks.map((block) => (
            <li key={block.id}>{block.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
