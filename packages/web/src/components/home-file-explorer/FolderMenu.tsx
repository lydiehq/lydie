import { useState, useEffect } from "react";
import { Form, Heading } from "react-aria-components";
import { Menu, MenuItem, MenuSeparator } from "@/components/generic/Menu";
import { Button } from "@/components/generic/Button";
import { Modal } from "@/components/generic/Modal";
import { Dialog } from "@/components/generic/Dialog";
import { Separator } from "@/components/generic/Separator";
import { Input, Label } from "@/components/generic/Field";
import { TextField } from "react-aria-components";
import { useZero } from "@/services/zero";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { toast } from "sonner";
import { mutators } from "@lydie/zero/mutators";
import type { PopoverProps } from "@/components/generic/Popover";
import { FilePlus } from "lucide-react";

type FolderMenuProps = {
  folderId: string;
  folderName: string;
  placement?: PopoverProps["placement"];
};

export function FolderMenu({
  folderId,
  folderName,
  placement = "bottom end",
}: FolderMenuProps) {
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(folderName);
  const z = useZero();
  const { deleteFolder, createDocument } = useDocumentActions();

  // Sync renameValue when dialog opens or folderName changes
  useEffect(() => {
    if (isRenameDialogOpen) {
      setRenameValue(folderName);
    }
  }, [isRenameDialogOpen, folderName]);

  const handleRename = () => {
    if (!renameValue.trim()) {
      toast.error("Folder name cannot be empty");
      return;
    }

    try {
      z.mutate(
        mutators.folder.rename({
          folderId,
          name: renameValue.trim(),
        })
      );
      toast.success("Folder renamed");
      setIsRenameDialogOpen(false);
    } catch (error) {
      toast.error("Failed to rename folder");
    }
  };

  const handleDelete = () => {
    deleteFolder(folderId);
  };

  const handleCreateDocument = () => {
    createDocument(folderId);
  };

  return (
    <>
      <Menu placement={placement}>
        <MenuItem onAction={handleCreateDocument}>Create document</MenuItem>
        <MenuSeparator />
        <MenuItem onAction={() => setIsRenameDialogOpen(true)}>Rename</MenuItem>
        <MenuItem onAction={handleDelete}>Delete</MenuItem>
      </Menu>

      <Modal
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        isDismissable
      >
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleRename();
            }}
          >
            <div className="p-3">
              <Heading
                slot="title"
                className="text-sm font-medium text-gray-700"
              >
                Rename Folder
              </Heading>
            </div>
            <Separator />
            <div className="p-3 space-y-4">
              <TextField
                value={renameValue}
                onChange={setRenameValue}
                autoFocus
              >
                <Label>Folder Name</Label>
                <Input />
              </TextField>
              <div className="flex justify-end gap-2">
                <Button
                  intent="secondary"
                  onPress={() => {
                    setIsRenameDialogOpen(false);
                    setRenameValue(folderName);
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
    </>
  );
}
