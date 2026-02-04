import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox, CheckboxGroup } from "@lydie/ui/components/generic/Checkbox";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
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

import { SimpleEditorToolbar } from "@/components/editor/SimpleEditorToolbar";
import { Card } from "@/components/layout/Card";
import { useAuth } from "@/context/auth.context";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";

type DetailedDescriptionEditorProps = {
  initialContent: string;
  onContentChange: (html: string) => void;
};

function DetailedDescriptionEditor({
  initialContent,
  onContentChange,
}: DetailedDescriptionEditorProps) {
  console.log("initialContent", initialContent);
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "text-sm min-h-[200px] max-h-[300px] p-3",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="mt-4 border border-gray-300 rounded-lg overflow-hidden bg-white">
      <SimpleEditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

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
  const [templateDetailedDescription, setTemplateDetailedDescription] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [faqs, setFaqs] = useState<
    { id?: string; question: string; answer: string; sort_order: number }[]
  >([]);
  const [newFaqQuestion, setNewFaqQuestion] = useState("");
  const [newFaqAnswer, setNewFaqAnswer] = useState("");

  // Load template data when available
  useEffect(() => {
    if (template) {
      setTemplateName(template.name || "");
      setTemplateTeaser(template.teaser || "");
      setTemplateDetailedDescription(template.detailed_description || "");

      // Load categories
      if (template.categoryAssignments) {
        setSelectedCategoryIds(
          template.categoryAssignments.map((assignment) => assignment.category_id),
        );
      }

      // Load FAQs
      if (template.faqs) {
        setFaqs(
          template.faqs
            .map((faq) => ({
              id: faq.id,
              question: faq.question,
              answer: faq.answer,
              sort_order: faq.sort_order,
            }))
            .sort((a, b) => a.sort_order - b.sort_order),
        );
      } else {
        setFaqs([]);
      }
    }
  }, [template]);

  const handleAddFaq = () => {
    if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) return;

    const newFaq = {
      question: newFaqQuestion.trim(),
      answer: newFaqAnswer.trim(),
      sort_order: faqs.length,
    };

    setFaqs([...faqs, newFaq]);
    setNewFaqQuestion("");
    setNewFaqAnswer("");
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    const updatedFaqs = [...faqs];
    updatedFaqs[index] = { ...updatedFaqs[index], [field]: value };
    setFaqs(updatedFaqs);
  };

  const handleDeleteFaq = (index: number) => {
    const updatedFaqs = faqs
      .filter((_, i) => i !== index)
      .map((faq, i) => ({
        ...faq,
        sort_order: i,
      }));
    setFaqs(updatedFaqs);
  };

  const handleSaveFaqs = async () => {
    if (!template) return;

    try {
      // Delete existing FAQs and create new ones
      for (const faq of faqs) {
        if (faq.id) {
          await z.mutate(
            mutators.templateFaq.update({
              faqId: faq.id,
              question: faq.question,
              answer: faq.answer,
              sortOrder: faq.sort_order,
            }),
          );
        } else {
          await z.mutate(
            mutators.templateFaq.create({
              templateId: template.id,
              question: faq.question,
              answer: faq.answer,
              sortOrder: faq.sort_order,
            }),
          );
        }
      }

      toast.success("FAQs saved successfully!");
    } catch (error) {
      console.error("Failed to save FAQs:", error);
      toast.error("Failed to save FAQs. Please try again.");
    }
  };

  const handleSaveTemplate = async () => {
    if (!template || !templateName.trim()) {
      return;
    }

    try {
      const detailedDescription = templateDetailedDescription
        ? templateDetailedDescription
        : undefined;

      z.mutate(
        mutators.template.update({
          templateId: template.id,
          name: templateName.trim(),
          teaser: templateTeaser.trim() || undefined,
          detailedDescription,
          categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
        }),
      );

      toast.success("Template updated successfully!");
      navigate({
        to: "/w/$organizationSlug/settings/templates",
        params: { organizationSlug: Route.useParams().organizationSlug },
      });
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
            <SectionHeader
              heading="Template Information"
              description="Edit basic template details."
            />
            <div className="mt-4 space-y-4">
              <TextField value={templateName} onChange={setTemplateName}>
                <Label>Template Name</Label>
                <Input placeholder="e.g., Developer Resume" />
              </TextField>
              <TextField value={templateTeaser} onChange={setTemplateTeaser}>
                <Label>Teaser (Short Description)</Label>
                <Input placeholder="A brief description shown in listings..." />
              </TextField>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader
              heading="Detailed Description"
              description="Provide a rich text description for the template."
            />
            <DetailedDescriptionEditor
              key={template.id}
              initialContent={template.detailed_description ?? ""}
              onContentChange={setTemplateDetailedDescription}
            />
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

          <Card className="p-6">
            <SectionHeader
              heading="FAQs"
              description="Add frequently asked questions for this template."
            />
            <div className="mt-4 space-y-4">
              {/* Existing FAQs */}
              {faqs.map((faq, index) => (
                <div
                  key={faq.id || `new-${index}`}
                  className="border border-gray-200 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-3">
                      <TextField
                        value={faq.question}
                        onChange={(value) => handleUpdateFaq(index, "question", value)}
                      >
                        <Label>Question</Label>
                        <Input placeholder="e.g., What is this template used for?" />
                      </TextField>
                      <TextField
                        value={faq.answer}
                        onChange={(value) => handleUpdateFaq(index, "answer", value)}
                      >
                        <Label>Answer</Label>
                        <textarea
                          value={faq.answer}
                          onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                          placeholder="Provide a detailed answer..."
                          className="w-full min-h-[80px] p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </TextField>
                    </div>
                    <Button
                      intent="ghost"
                      size="icon-sm"
                      onPress={() => handleDeleteFaq(index)}
                      aria-label="Delete FAQ"
                    >
                      <DeleteRegular className="size-4 text-gray-500" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Add New FAQ */}
              <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3">
                <TextField value={newFaqQuestion} onChange={setNewFaqQuestion}>
                  <Label>New Question</Label>
                  <Input placeholder="e.g., What is this template used for?" />
                </TextField>
                <TextField value={newFaqAnswer} onChange={setNewFaqAnswer}>
                  <Label>New Answer</Label>
                  <textarea
                    value={newFaqAnswer}
                    onChange={(e) => setNewFaqAnswer(e.target.value)}
                    placeholder="Provide a detailed answer..."
                    className="w-full min-h-[80px] p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </TextField>
                <Button
                  onPress={handleAddFaq}
                  intent="secondary"
                  size="sm"
                  isDisabled={!newFaqQuestion.trim() || !newFaqAnswer.trim()}
                >
                  <AddRegular className="size-3.5 mr-1" />
                  Add FAQ
                </Button>
              </div>

              {/* Save FAQs Button */}
              {faqs.length > 0 && (
                <div className="flex justify-end">
                  <Button onPress={handleSaveFaqs} size="sm">
                    Save FAQs
                  </Button>
                </div>
              )}
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
