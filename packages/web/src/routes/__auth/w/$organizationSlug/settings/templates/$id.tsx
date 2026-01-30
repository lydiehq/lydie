import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { Form, Heading } from "react-aria-components";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox, CheckboxGroup } from "@lydie/ui/components/generic/Checkbox";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { Card } from "@/components/layout/Card";
import { SimpleEditorToolbar } from "@/components/editor/SimpleEditorToolbar";
import { useAuth } from "@/context/auth.context";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/templates/$id")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { zero } = context;
    const { id } = params;

    const template = zero.run(
      queries.templates.byIdWithCategories({
        templateId: id,
      }),
    );

    return { template };
  },
});

function RouteComponent() {
  const { user } = useAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const z = useZero();

  const [template, templateStatus] = useQuery(
    queries.templates.byIdWithCategories({
      templateId: id,
    }),
  );
  const [categories] = useQuery(queries.templateCategories.all({}));

  const [templateName, setTemplateName] = useState("");
  const [templateTeaser, setTemplateTeaser] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateDetailedDescription, setTemplateDetailedDescription] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [faqs, setFaqs] = useState<{ id?: string; question: string; answer: string; sort_order: number }[]>([]);
  const [newFaqQuestion, setNewFaqQuestion] = useState("");
  const [newFaqAnswer, setNewFaqAnswer] = useState("");

  const detailedDescriptionEditor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor }) => {
      setTemplateDetailedDescription(JSON.stringify(editor.getJSON()));
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "text-sm min-h-[200px] max-h-[300px] p-3",
      },
    },
  });

  // Load template data when available
  useEffect(() => {
    if (template) {
      setTemplateName(template.name || "");
      setTemplateTeaser(template.teaser || "");
      setTemplateDescription(template.description || "");

      // Load detailed description into editor
      if (template.detailed_description) {
        try {
          const parsed = JSON.parse(template.detailed_description);
          detailedDescriptionEditor?.commands.setContent(parsed);
          setTemplateDetailedDescription(template.detailed_description);
        } catch {
          detailedDescriptionEditor?.commands.setContent("");
        }
      } else {
        detailedDescriptionEditor?.commands.setContent("");
      }

      // Load categories
      if (template.categoryAssignments) {
        setSelectedCategoryIds(
          template.categoryAssignments.map((assignment) => assignment.category_id)
        );
      }
    }
  }, [template, detailedDescriptionEditor]);

  const handleSaveTemplate = async () => {
    if (!template || !templateName.trim()) {
      return;
    }

    try {
      const detailedDescriptionJson =
        detailedDescriptionEditor && templateDetailedDescription
          ? templateDetailedDescription
          : undefined;

      z.mutate(
        mutators.template.update({
          templateId: template.id,
          name: templateName.trim(),
          description: templateDescription.trim() || undefined,
          teaser: templateTeaser.trim() || undefined,
          detailedDescription: detailedDescriptionJson,
          categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
        }),
      );

      toast.success("Template updated successfully!");
      navigate({ to: "/w/$organizationSlug/settings/templates", params: { organizationSlug: Route.useParams().organizationSlug } });
    } catch (error) {
      console.error("Failed to update template:", error);
      toast.error("Failed to update template. Please try again.");
    }
  };

  if (!isAdmin(user)) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Edit Template</Heading>
        </div>
        <Separator />
        <Card className="p-8 text-center">
          <div className="text-sm font-medium text-gray-700">Access Denied</div>
          <div className="text-xs mt-1 text-gray-500">
            You do not have permission to access this page.
          </div>
        </Card>
      </div>
    );
  }

  if (!template && templateStatus.type === "complete") {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Edit Template</Heading>
        </div>
        <Separator />
        <Card className="p-8 text-center">
          <div className="text-sm font-medium text-gray-700">Template Not Found</div>
          <div className="text-xs mt-1 text-gray-500">
            The template you are looking for does not exist.
          </div>
          <Button
            size="sm"
            onPress={() =>
              navigate({
                to: "/w/$organizationSlug/settings/templates",
                params: { organizationSlug: Route.useParams().organizationSlug },
              })
            }
            className="mt-4"
          >
            Back to Templates
          </Button>
        </Card>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <Heading level={1}>Edit Template</Heading>
        <Button
          intent="secondary"
          size="sm"
          onPress={() =>
            navigate({
              to: "/w/$organizationSlug/settings/templates",
              params: { organizationSlug: Route.useParams().organizationSlug },
            })
          }
        >
          Back to Templates
        </Button>
      </div>
      <Separator />

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveTemplate();
        }}
      >
        <div className="flex flex-col gap-y-6">
          <Card className="p-6">
            <SectionHeader heading="Template Information" description="Edit basic template details." />
            <div className="mt-4 space-y-4">
              <TextField value={templateName} onChange={setTemplateName}>
                <Label>Template Name</Label>
                <Input placeholder="e.g., Developer Resume" />
              </TextField>
              <TextField value={templateTeaser} onChange={setTemplateTeaser}>
                <Label>Teaser (Short Description)</Label>
                <Input placeholder="A brief description shown in listings..." />
              </TextField>
              <TextField value={templateDescription} onChange={setTemplateDescription}>
                <Label>Description (Deprecated)</Label>
                <Input placeholder="Legacy description field..." />
              </TextField>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader
              heading="Detailed Description"
              description="Provide a rich text description for the template."
            />
            {detailedDescriptionEditor && (
              <div className="mt-4 border border-gray-300 rounded-lg overflow-hidden bg-white">
                <EditorContent editor={detailedDescriptionEditor} />
              </div>
            )}
          </Card>

          <Card className="p-6">
            <SectionHeader heading="Categories" description="Assign categories to this template." />
            <div className="mt-4">
              <CheckboxGroup
                label="Categories"
                value={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
              >
                <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                  {categories && categories.length > 0 ? (
                    categories.map((category) => (
                      <Checkbox key={category.id} value={category.id} slot="selection">
                        {category.name}
                      </Checkbox>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">No categories available</div>
                  )}
                </div>
              </CheckboxGroup>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              intent="secondary"
              onPress={() =>
                navigate({
                  to: "/w/$organizationSlug/settings/templates",
                  params: { organizationSlug: Route.useParams().organizationSlug },
                })
              }
              size="sm"
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isDisabled={!templateName.trim()}>
              Save Template
            </Button>
          </div>
        </div>
      </Form>
    </div>
  );
}
