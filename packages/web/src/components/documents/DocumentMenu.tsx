import { Shield12Filled } from "@fluentui/react-icons";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Form, Heading } from "react-aria-components";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import type { PopoverProps } from "@/components/generic/Popover";

import { Button } from "@/components/generic/Button";
import { Checkbox, CheckboxGroup } from "@/components/generic/Checkbox";
import { Dialog } from "@/components/generic/Dialog";
import { Input, Label } from "@/components/generic/Field";
import { Menu, MenuItem, MenuSeparator } from "@/components/generic/Menu";
import { Modal } from "@/components/generic/Modal";
import { Separator } from "@/components/generic/Separator";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { isAdmin } from "@/utils/admin";

type DocumentMenuProps = {
  documentId: string;
  documentName: string;
  placement?: PopoverProps["placement"];
};

export function DocumentMenu({
  documentId,
  documentName,
  placement = "bottom end",
}: DocumentMenuProps) {
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(documentName);
  const [templateName, setTemplateName] = useState("");
  const [templateTeaser, setTemplateTeaser] = useState("");
  const [templateDetailedDescription, setTemplateDetailedDescription] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const [categories] = useQuery(queries.templateCategories.all({}));

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
  const z = useZero();
  const { deleteDocument, publishDocument } = useDocumentActions();
  const { id: currentDocId } = useParams({ strict: false });
  const { organization } = useOrganization();
  const { user } = useAuth();

  const [document] = useQuery(
    queries.documents.byId({ organizationId: organization.id, documentId }),
  );
  const userIsAdmin = isAdmin(user);

  useEffect(() => {
    if (isRenameDialogOpen) {
      setRenameValue(documentName);
    }
  }, [isRenameDialogOpen, documentName]);

  useEffect(() => {
    if (isCreateTemplateDialogOpen) {
      setTemplateName("");
      setTemplateTeaser("");
      setTemplateDetailedDescription("");
      setSelectedCategoryIds([]);
      detailedDescriptionEditor?.commands.setContent("");
    }
  }, [isCreateTemplateDialogOpen, detailedDescriptionEditor]);

  const handleRename = () => {
    if (!renameValue.trim()) {
      toast.error("Document name cannot be empty");
      return;
    }

    try {
      z.mutate(
        mutators.document.update({
          documentId,
          organizationId: organization.id,
          title: renameValue.trim(),
        }),
      );

      toast.success("Document renamed");
      setIsRenameDialogOpen(false);
    } catch {
      toast.error("Failed to rename document");
    }
  };

  const handleDelete = () => {
    if (document?.integration_link_id) {
      deleteDocument(documentId, currentDocId === documentId, document.integration_link_id);
      return;
    }

    const itemName = documentName;

    confirmDialog({
      title: `Delete "${itemName.length > 16 ? itemName.slice(0, 10) + "..." : itemName}"`,
      message: `This action cannot be undone. This document will be permanently deleted.`,
      onConfirm: () => {
        deleteDocument(documentId, currentDocId === documentId);
      },
    });
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      return;
    }

    if (!document) {
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
          description: templateTeaser.trim() || undefined, // Keep for backward compatibility
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
      setIsCreateTemplateDialogOpen(false);
      setTemplateName("");
      setTemplateTeaser("");
      setTemplateDetailedDescription("");
      setSelectedCategoryIds([]);
      detailedDescriptionEditor?.commands.setContent("");
    } catch (error) {
      console.error("Failed to create template:", error);
      toast.error("Failed to create template. Please try again.");
    }
  };

  return (
    <>
      <Menu placement={placement}>
        <MenuItem onAction={() => setIsInfoDialogOpen(true)}>Info</MenuItem>
        <MenuItem onAction={() => setIsRenameDialogOpen(true)}>Rename</MenuItem>
        {document?.integration_link_id && !document?.published && (
          <MenuItem onAction={() => publishDocument(documentId)}>Publish</MenuItem>
        )}
        <MenuItem onAction={handleDelete}>Delete</MenuItem>
        <MenuSeparator />
        {userIsAdmin && (
          <MenuItem onAction={() => setIsCreateTemplateDialogOpen(true)}>Create template</MenuItem>
        )}
      </Menu>

      <Modal isOpen={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen} isDismissable>
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleRename();
            }}
          >
            <div className="p-3">
              <Heading slot="title" className="text-sm font-medium text-gray-700">
                Rename Document
              </Heading>
            </div>
            <Separator />
            <div className="p-3 space-y-4">
              <TextField value={renameValue} onChange={setRenameValue}>
                <Label>Document Name</Label>
                <Input />
              </TextField>
              <div className="flex justify-end gap-2">
                <Button
                  intent="secondary"
                  onPress={() => {
                    setIsRenameDialogOpen(false);
                    setRenameValue(documentName);
                  }}
                  size="sm"
                  type="button"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Rename
                </Button>
              </div>
            </div>
          </Form>
        </Dialog>
      </Modal>

      <Modal isOpen={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen} isDismissable size="md">
        <Dialog>
          <div className="p-3">
            <Heading slot="title" className="text-sm font-medium text-gray-700">
              Document Info
            </Heading>
          </div>
          <Separator />
          <div className="p-3 space-y-4">
            {document ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Title</Label>
                  <p className="text-sm text-gray-900 mt-1">{document.title}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Slug</Label>
                  <p className="text-sm text-gray-900 mt-1 font-mono">{document.slug}</p>
                </div>
                <div role="group" aria-labelledby="publication-status-label">
                  <Label id="publication-status-label" className="text-xs text-gray-500">
                    Publication Status
                  </Label>
                  <div className="mt-1">
                    <span
                      className={`text-xs px-2 py-1 rounded inline-block ${
                        document.published
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {document.published ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
                {document.created_at && (
                  <div>
                    <Label className="text-xs text-gray-500">Created</Label>
                    <p className="text-sm text-gray-900 mt-1">
                      {format(new Date(document.created_at), "PPpp")}
                    </p>
                  </div>
                )}
                {document.updated_at && (
                  <div>
                    <Label className="text-xs text-gray-500">Last Updated</Label>
                    <p className="text-sm text-gray-900 mt-1">
                      {format(new Date(document.updated_at), "PPpp")}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
            <div className="flex justify-end">
              <Button intent="secondary" onPress={() => setIsInfoDialogOpen(false)} size="sm">
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>

      <Modal
        isOpen={isCreateTemplateDialogOpen}
        onOpenChange={setIsCreateTemplateDialogOpen}
        isDismissable
      >
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
                    setIsCreateTemplateDialogOpen(false);
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
    </>
  );
}
