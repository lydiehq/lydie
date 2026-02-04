import { Button } from "@lydie/ui/components/generic/Button";
import { Checkbox, CheckboxGroup } from "@lydie/ui/components/generic/Checkbox";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { Form, Heading } from "react-aria-components";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { SimpleEditorToolbar } from "@/components/editor/SimpleEditorToolbar";
import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  documentId: string;
  onSuccess?: () => void;
};

export function CreateTemplateDialog({ isOpen, onOpenChange, documentId, onSuccess }: Props) {
  const [templateName, setTemplateName] = useState("");
  const [templateTeaser, setTemplateTeaser] = useState("");
  const [templateDetailedDescription, setTemplateDetailedDescription] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const [categories] = useQuery(queries.templateCategories.all({}));
  const { organization } = useOrganization();
  const z = useZero();

  const detailedDescriptionEditor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor }) => {
      setTemplateDetailedDescription(JSON.stringify(editor.getJSON()));
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "text-sm min-h-[200px] max-h-[300px] p-3 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (isOpen) {
      setTemplateName("");
      setTemplateTeaser("");
      setTemplateDetailedDescription("");
      setSelectedCategoryIds([]);
      detailedDescriptionEditor?.commands.setContent("");
    }
  }, [isOpen, detailedDescriptionEditor]);

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      return;
    }

    try {
      const detailedDescriptionJson =
        detailedDescriptionEditor && templateDetailedDescription
          ? templateDetailedDescription
          : undefined;

      const result = await z.mutate(
        mutators.template.create({
          name: templateName.trim(),
          description: templateTeaser.trim() || undefined,
          teaser: templateTeaser.trim() || undefined,
          detailedDescription: detailedDescriptionJson,
          categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
          rootDocumentId: documentId,
          organizationId: organization.id,
        }),
      );

      if (result?.client) {
        await result.client;
      }

      toast.success("Template created successfully!");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Failed to create template:", error);
      toast.error("Failed to create template. Please try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Dialog>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateTemplate();
          }}
        >
          <div className="p-3">
            <Heading slot="title" className="text-sm font-medium text-gray-700">
              Create Template
            </Heading>
          </div>
          <Separator />
          <div className="p-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <TextField value={templateName} onChange={setTemplateName}>
                  <Label>Template Name</Label>
                  <Input placeholder="e.g., Developer Resume" />
                </TextField>
                <TextField value={templateTeaser} onChange={setTemplateTeaser}>
                  <Label>Teaser (Short Description)</Label>
                  <Input placeholder="A brief description shown in listings..." />
                </TextField>
                <div className="flex flex-col gap-2">
                  <Label>Detailed Description</Label>
                  {detailedDescriptionEditor && (
                    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                      <SimpleEditorToolbar editor={detailedDescriptionEditor} />
                      <EditorContent editor={detailedDescriptionEditor} className="" />
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <CheckboxGroup
                  label="Categories"
                  value={selectedCategoryIds}
                  onChange={setSelectedCategoryIds}
                >
                  <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                    {categories.map((category) => (
                      <Checkbox key={category.id} value={category.id} slot="selection">
                        {category.name}
                      </Checkbox>
                    ))}
                  </div>
                </CheckboxGroup>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                intent="secondary"
                onPress={() => {
                  onOpenChange(false);
                  setTemplateName("");
                  setTemplateTeaser("");
                  setTemplateDetailedDescription("");
                  setSelectedCategoryIds([]);
                  detailedDescriptionEditor?.commands.setContent("");
                }}
                size="sm"
                type="button"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isDisabled={!templateName.trim()}>
                Create Template
              </Button>
            </div>
          </div>
        </Form>
      </Dialog>
    </Modal>
  );
}
