import { getRandomColor } from "@lydie/core/colors";
import { COLORS } from "@lydie/core/colors";
import { slugify } from "@lydie/core/utils";
import { Button } from "@lydie/ui/components/generic/Button";
import { mutators } from "@lydie/zero/mutators";
import { useState } from "react";
import { Form } from "react-aria-components";

import { useAppForm } from "@/hooks/use-app-form";
import { useZero } from "@/services/zero";

import { OrganizationColorPicker } from "./OrganizationColorPicker";

type WorkspaceFormProps = {
  organization: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  };
};

export function WorkspaceForm({ organization }: WorkspaceFormProps) {
  const z = useZero();
  const [selectedColor, setSelectedColor] = useState<string>(
    organization.color || getRandomColor().value,
  );
  const [formMessage, setFormMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const workspaceForm = useAppForm({
    defaultValues: {
      name: organization.name,
      slug: organization.slug,
    },
    onSubmit: async (values) => {
      // Clear any previous messages
      setFormMessage(null);

      if (!values.value.name.trim()) {
        setFormMessage({ type: "error", message: "Workspace name cannot be empty" });
        return;
      }

      if (!values.value.slug.trim()) {
        setFormMessage({ type: "error", message: "Workspace slug cannot be empty" });
        return;
      }

      // Auto-correct the slug to ensure it's properly formatted
      const slugified = slugify(values.value.slug.trim());
      if (slugified !== values.value.slug.trim()) {
        // Update the form field with the corrected slug
        workspaceForm.setFieldValue("slug", slugified);
      }

      const hasChanges =
        values.value.name.trim() !== organization.name ||
        slugified !== organization.slug ||
        selectedColor !== organization.color;

      if (!hasChanges) {
        return;
      }

      const slugChanged = slugified !== organization.slug;

      try {
        const write = z.mutate(
          mutators.organization.update({
            organizationId: organization.id,
            name: values.value.name.trim(),
            slug: slugified,
            color: selectedColor,
          }),
        );

        await write.server;

        setFormMessage({ type: "success", message: "Workspace updated successfully" });

        // If slug changed, do a hard refresh to the new URL
        // This ensures the session is completely fresh from the server
        if (slugChanged) {
          const newUrl = `/w/${slugified}/settings`;
          window.location.href = newUrl;
          return; // Don't continue - page will reload
        }
      } catch (error: any) {
        let errorMessage = "Failed to update workspace";

        if (error?.message) {
          if (error.message === "Slug is already taken") {
            errorMessage = "This slug is already taken. Please choose a different one.";
          } else if (error.message.includes("Access denied")) {
            errorMessage = "You don't have permission to update this workspace.";
          } else {
            errorMessage = error.message;
          }
        } else if (error?.toString) {
          errorMessage = error.toString();
        }

        setFormMessage({ type: "error", message: errorMessage });
        console.error("Workspace update error:", error);

        return;
      }
    },
  });

  return (
    <Form
      className="flex flex-col gap-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        workspaceForm.handleSubmit();
      }}
    >
      <workspaceForm.AppField
        name="name"
        children={(field) => <field.TextField label="Workspace Name" />}
      />
      <workspaceForm.AppField
        name="slug"
        listeners={{
          onBlur: (e) => {
            const slugified = slugify(e.value);
            workspaceForm.setFieldValue("slug", slugified);
          },
        }}
        children={(field) => (
          <field.TextField
            label="Workspace Slug"
            description="Used in URLs and API endpoints. Only letters, numbers, and hyphens are allowed."
          />
        )}
      />
      <OrganizationColorPicker selectedColor={selectedColor} onColorChange={setSelectedColor} />
      {formMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`text-sm ${formMessage.type === "error" ? "text-red-600" : "text-green-600"}`}
        >
          {formMessage.message}
        </div>
      )}
      <div className="flex justify-end gap-x-1">
        <Button
          intent="secondary"
          size="sm"
          onPress={() => {
            workspaceForm.reset();
            setSelectedColor(organization.color || COLORS[0].value);
            setFormMessage(null);
          }}
        >
          Cancel
        </Button>
        <Button size="sm" type="submit" isPending={workspaceForm.state.isSubmitting}>
          {workspaceForm.state.isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </Form>
  );
}
