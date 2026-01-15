import { Editor } from "@tiptap/react";
import {
  Button as RACButton,
  Toolbar,
  Group,
  Separator,
  MenuTrigger,
  TooltipTrigger,
} from "react-aria-components";
import {
  List,
  ListOrdered,
  Table,
  Plus,
  Minus,
  Trash2,
  Columns,
  Rows,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Link,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { useState, useRef } from "react";
import { useImageUpload } from "@/hooks/use-image-upload";
import { DocumentSettingsDialog } from "./DocumentSettingsDialog";
import { Menu, MenuItem } from "../generic/Menu";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { ToolbarButton } from "./toolbar/ToolbarButton";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";
import { isAdmin } from "@/utils/admin";
import { toast } from "sonner";
import { MoreVerticalIcon } from "@/icons";
import { Button } from "../generic/Button";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { SidebarIcon } from "../layout/SidebarIcon";
import { Tooltip } from "../generic/Tooltip";

type Props = {
  editor: Editor;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  onAddLink?: () => void;
};

export function EditorToolbar({ editor, doc, onAddLink }: Props) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { deleteDocument, publishDocument, updateDocument } =
    useDocumentActions();
  const { uploadImage } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);

  // Detect platform for keyboard shortcuts
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const mod = isMac ? "⌘" : "Ctrl";

  const handleDownloadTemplate = () => {
    try {
      // Get current content from editor
      const jsonContent = editor.getJSON();

      // Prompt for template metadata
      const category =
        prompt(
          "Enter template category (e.g., 'Getting Started', 'API Documentation'):"
        ) || "";
      const description = prompt("Enter template description:") || "";

      if (!category || !description) {
        toast.error("Category and description are required");
        return;
      }

      // Create template object
      const template = {
        title: doc.title,
        category,
        description,
        content: jsonContent,
      };

      // Convert to JSON and download
      const jsonString = JSON.stringify(template, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${
        doc.slug || doc.title.toLowerCase().replace(/\s+/g, "-")
      }-template.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Template downloaded successfully");
    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Failed to download template");
    }
  const handlePublish = async () => {
    publishDocument(doc.id);
  };

  const handleUnpublish = async () => {
    updateDocument(doc.id, { published: false });
  };

  return (
    <div className="flex justify-between items-center p-1 border-b border-gray-200 gap-1">
      <Toolbar aria-label="Editor formatting" className="flex items-center">
        <div className="flex">
          {/* <Group aria-label="History" className="flex gap-1">
            <ToolbarButton
              onPress={() => editor.chain().focus().undo().run()}
              title="Undo"
              icon={Undo}
              editor={editor}
              isDisabled={!editor.can().undo()}
              hotkeys={[mod, "Z"]}
            />
            <ToolbarButton
              onPress={() => editor.chain().focus().redo().run()}
              title="Redo"
              icon={Redo}
              editor={editor}
              isDisabled={!editor.can().redo()}
              hotkeys={[mod, "Shift", "Z"]}
            />
          </Group> */}

          {/* <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          /> */}

          <Group aria-label="Text style" className="flex gap-1">
            <ToolbarButton
              onPress={() => editor.chain().focus().toggleBold().run()}
              title="Bold"
              icon={Bold}
              editor={editor}
              hotkeys={[mod, "B"]}
            />
            <ToolbarButton
              onPress={() => editor.chain().focus().toggleItalic().run()}
              title="Italic"
              icon={Italic}
              editor={editor}
              hotkeys={[mod, "I"]}
            />
            <ToolbarButton
              onPress={() => editor.chain().focus().toggleStrike().run()}
              title="Strike"
              icon={Strikethrough}
              editor={editor}
              hotkeys={[mod, "Shift", "S"]}
            />
            <ToolbarButton
              onPress={() => editor.chain().focus().toggleCode().run()}
              title="Code"
              icon={Code}
              editor={editor}
              hotkeys={[mod, "E"]}
            />
          </Group>

          <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          />

          <Group aria-label="Heading level" className="flex gap-1">
            <ToolbarButton
              onPress={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              title="Heading 1"
              icon={Heading1}
              editor={editor}
            />
            <ToolbarButton
              onPress={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              title="Heading 2"
              icon={Heading2}
              editor={editor}
            />
            <ToolbarButton
              onPress={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              title="Heading 3"
              icon={Heading3}
              editor={editor}
            />
          </Group>

          <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          />

          <Group aria-label="List format" className="flex gap-1">
            <ToolbarButton
              onPress={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet List"
              icon={List}
              editor={editor}
            />
            <ToolbarButton
              onPress={() => editor.chain().focus().toggleOrderedList().run()}
              title="Ordered List"
              icon={ListOrdered}
              editor={editor}
            />
          </Group>

          <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          />

          <Group aria-label="Link" className="flex gap-1">
            <ToolbarButton
              onPress={() => {
                if (onAddLink) {
                  onAddLink();
                }
              }}
              title="Add Link"
              icon={Link}
              editor={editor}
              isDisabled={editor.state.selection.empty}
            />
          </Group>

          <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          />

          <Group aria-label="Image" className="flex gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                try {
                  const url = await uploadImage(file);
                  const alt =
                    prompt("Enter alt text for the image (optional):") || "";
                  editor.chain().focus().setImage({ src: url, alt }).run();
                } catch (error) {
                  console.error("Failed to upload image:", error);
                  alert("Failed to upload image. Please try again.");
                } finally {
                  // Reset input so the same file can be selected again
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }
              }}
            />
            <ToolbarButton
              onPress={() => {
                fileInputRef.current?.click();
              }}
              title="Insert Image"
              icon={ImageIcon}
              editor={editor}
            />
          </Group>

          <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          />

          <Group aria-label="Table" className="flex gap-1">
            <ToolbarButton
              onPress={() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
              title="Insert Table"
              icon={Table}
              editor={editor}
            />

            {/* Table management buttons - only show when in a table */}
            {editor.isActive("table") && (
              <>
                <Separator
                  orientation="vertical"
                  className="mx-1 h-6 w-px bg-gray-200"
                />

                <MenuTrigger>
                  <RACButton
                    className="flex items-center gap-1 p-1.5 rounded hover:bg-gray-100"
                    aria-label="Table Columns"
                  >
                    <Columns className="size-4" />
                  </RACButton>
                  <Menu>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().addColumnBefore().run()
                      }
                    >
                      Add Column Before
                    </MenuItem>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().addColumnAfter().run()
                      }
                    >
                      Add Column After
                    </MenuItem>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().deleteColumn().run()
                      }
                    >
                      Delete Column
                    </MenuItem>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().toggleHeaderColumn().run()
                      }
                    >
                      Toggle Header Column
                    </MenuItem>
                  </Menu>
                </MenuTrigger>

                <MenuTrigger>
                  <RACButton
                    className="flex items-center gap-1 p-1.5 rounded hover:bg-gray-100"
                    aria-label="Table Rows"
                  >
                    <Rows className="size-4" />
                  </RACButton>
                  <Menu>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().addRowBefore().run()
                      }
                    >
                      Add Row Before
                    </MenuItem>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().addRowAfter().run()
                      }
                    >
                      Add Row After
                    </MenuItem>
                    <MenuItem
                      onAction={() => editor.chain().focus().deleteRow().run()}
                    >
                      Delete Row
                    </MenuItem>
                    <MenuItem
                      onAction={() =>
                        editor.chain().focus().toggleHeaderRow().run()
                      }
                    >
                      Toggle Header Row
                    </MenuItem>
                  </Menu>
                </MenuTrigger>

                <ToolbarButton
                  onPress={() => editor.chain().focus().mergeCells().run()}
                  title="Merge Cells"
                  icon={Plus}
                  editor={editor}
                />
                <ToolbarButton
                  onPress={() => editor.chain().focus().splitCell().run()}
                  title="Split Cell"
                  icon={Minus}
                  editor={editor}
                />
                <ToolbarButton
                  onPress={() => editor.chain().focus().deleteTable().run()}
                  title="Delete Table"
                  icon={Trash2}
                  editor={editor}
                />
              </>
            )}
          </Group>

          {/* <Separator
            orientation="vertical"
            className="mx-1 h-6 w-px bg-gray-200"
          /> */}

          {/* <MenuTrigger>
            <RACButton className="flex items-center gap-1">
              <Layout className="size-4" />
              <span>Insert Block</span>
              <ChevronDown className="size-3" />
            </RACButton>
            <Menu>
              {documentComponents.map((component) => (
                <MenuItem
                  key={component.id}
                  onAction={() => {
                    insertDocumentComponent(
                      component.name,
                      component.properties as Record<string, { type: string }>
                    );
                  }}
                >
                  {component.name}
                </MenuItem>
              ))}
              <MenuItem
                onAction={() => {
                  const name = prompt("Enter block name");
                  if (name) {
                    insertDocumentComponent(name, {});
                  } else if (name !== null) {
                    toast.error("Document component name cannot be empty.");
                  }
                }}
              >
                + Create New Document Component
              </MenuItem>
            </Menu>
          </MenuTrigger> */}
        </div>
      </Toolbar>

      <div className="flex gap-x-1 items-center">
        <MenuTrigger>
          <RACButton
            aria-label="Document Options"
            className="p-1.5 rounded hover:bg-gray-100"
          >
            <MoreVerticalIcon className="size-3.5 text-gray-600" />
          </RACButton>
          <Menu>
            <MenuItem onAction={() => setIsSettingsOpen(true)}>
              Settings
            </MenuItem>
            {userIsAdmin && (
              <MenuItem onAction={handleDownloadTemplate}>
                <Download className="size-3.5 mr-1.5" />
                Download as Template
              </MenuItem>
            )}
            <MenuItem onAction={() => deleteDocument(doc.id, true)}>
              Delete
            </MenuItem>
          </Menu>
        </MenuTrigger>
        <Button
          onPress={doc.published ? handleUnpublish : handlePublish}
          intent="secondary"
          size="sm"
        >
          {doc.published ? "Unpublish" : "Publish"}
        </Button>
        <Separator
          orientation="vertical"
          className="mx-1 h-6 w-px bg-gray-200"
        />

        {/* <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              "p-1 rounded hover:bg-black/5 text-gray-700 group"
            )}
            // onPress={onToggle}
            aria-label="Expand sidebar"
          >
            <SidebarIcon direction="right" collapsed={false} />
          </RACButton>
          <Tooltip>Expand sidebar</Tooltip>
        </TooltipTrigger> */}

        <DocumentSettingsDialog
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          doc={doc}
        />
      </div>
    </div>
  );
}
