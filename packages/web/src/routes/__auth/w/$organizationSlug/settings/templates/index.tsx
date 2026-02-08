import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Input, Label } from "@lydie/ui/components/generic/Field";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Form, Heading } from "react-aria-components";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { Card } from "@/components/layout/Card";
import { useAuth } from "@/context/auth.context";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/templates/")({
  component: RouteComponent,
});

function RouteComponent() {
  useDocumentTitle("Templates");

  const { user } = useAuth();
  const z = useZero();
  const navigate = useNavigate();
  const { organizationSlug } = Route.useParams();

  if (!isAdmin(user)) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Templates</Heading>
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

  const [templates] = useQuery(queries.templates.all({}));
  const [categories] = useQuery(queries.templateCategories.all({}));

  // Category editing state
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryName, setCategoryName] = useState("");

  useEffect(() => {
    if (isCategoryDialogOpen && editingCategory) {
      setCategoryName(editingCategory.name || "");
    } else if (!isCategoryDialogOpen) {
      setCategoryName("");
      setEditingCategory(null);
    }
  }, [isCategoryDialogOpen, editingCategory]);

  const handleEditTemplate = (template: any) => {
    navigate({
      to: "/w/$organizationSlug/settings/templates/$id",
      params: { organizationSlug, id: template.id },
    });
  };

  const handleDeleteTemplate = (template: any) => {
    confirmDialog({
      title: `Delete "${template.name}"`,
      message: `This action cannot be undone. This template will be permanently deleted.`,
      onConfirm: async () => {
        try {
          await z.mutate(
            mutators.template.delete({
              templateId: template.id,
            }),
          );
          toast.success("Template deleted successfully!");
        } catch (error) {
          console.error("Failed to delete template:", error);
          toast.error("Failed to delete template. Please try again.");
        }
      },
    });
  };

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    setIsCategoryDialogOpen(true);
  };

  const handleCreateCategory = () => {
    setEditingCategory(null);
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      return;
    }

    try {
      if (editingCategory) {
        await z.mutate(
          mutators.templateCategory.update({
            categoryId: editingCategory.id,
            name: categoryName.trim(),
          }),
        );
        toast.success("Category updated successfully!");
      } else {
        await z.mutate(
          mutators.templateCategory.create({
            name: categoryName.trim(),
          }),
        );
        toast.success("Category created successfully!");
      }
      setIsCategoryDialogOpen(false);
    } catch (error) {
      console.error("Failed to save category:", error);
      toast.error("Failed to save category. Please try again.");
    }
  };

  const handleDeleteCategory = (category: any) => {
    confirmDialog({
      title: `Delete "${category.name}"`,
      message: `This action cannot be undone. This category will be permanently deleted.`,
      onConfirm: async () => {
        try {
          await z.mutate(
            mutators.templateCategory.delete({
              categoryId: category.id,
            }),
          );
          toast.success("Category deleted successfully!");
        } catch (error) {
          console.error("Failed to delete category:", error);
          toast.error("Failed to delete category. Please try again.");
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Templates</Heading>
      </div>
      <Separator />

      {/* Templates Section */}
      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="Templates"
          description="Manage document templates available to users."
        />
        <div className="flex flex-col gap-y-2">
          {templates && templates.length > 0 ? (
            templates.map((template) => (
              <Card key={template.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{template.name}</div>
                    {template.teaser && (
                      <div className="text-xs text-gray-600 mt-1">{template.teaser}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      Created {format(new Date(template.created_at), "PP")}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onPress={() => handleEditTemplate(template)}
                      size="sm"
                      intent="secondary"
                    >
                      <EditRegular className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      onPress={() => handleDeleteTemplate(template)}
                      size="sm"
                      intent="danger"
                    >
                      <DeleteRegular className="size-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-8 text-center">
              <div className="text-sm text-gray-500">
                No templates found. Create templates from documents.
              </div>
            </Card>
          )}
        </div>
      </div>

      <Separator />

      {/* Categories Section */}
      <div className="flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader
            heading="Categories"
            description="Manage template categories for organization."
          />
          <Button onPress={handleCreateCategory} size="sm">
            Create Category
          </Button>
        </div>
        <div className="flex flex-col gap-y-2">
          {categories && categories.length > 0 ? (
            categories.map((category) => (
              <Card key={category.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{category.name}</div>
                    <div className="text-xs text-gray-500 mt-1">Slug: {category.slug}</div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onPress={() => handleEditCategory(category)}
                      size="sm"
                      intent="secondary"
                    >
                      <EditRegular className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      onPress={() => handleDeleteCategory(category)}
                      size="sm"
                      intent="danger"
                    >
                      <DeleteRegular className="size-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-8 text-center">
              <div className="text-sm text-gray-500">
                No categories found. Create your first category.
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Category Modal */}
      <Modal isOpen={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen} isDismissable>
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveCategory();
            }}
          >
            <div className="p-3">
              <Heading slot="title" className="text-sm font-medium text-gray-700">
                {editingCategory ? "Edit Category" : "Create Category"}
              </Heading>
            </div>
            <Separator />
            <div className="p-3 space-y-4">
              <TextField value={categoryName} onChange={setCategoryName}>
                <Label>Category Name</Label>
                <Input placeholder="e.g., Business, Personal, Education" />
              </TextField>
              <div className="flex justify-end gap-2">
                <Button
                  intent="secondary"
                  onPress={() => setIsCategoryDialogOpen(false)}
                  size="sm"
                  type="button"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isDisabled={!categoryName.trim()}>
                  {editingCategory ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </div>
  );
}
