import type { QueryResultType } from "@rocicorp/zero";

import {
  AddFilled,
  ColumnRegular,
  DeleteFilled,
  ListFilled,
  MoreVerticalRegular,
  RowChildFilled,
  SubtractFilled,
  TextNumberListLtrFilled,
  TextStrikethroughFilled,
} from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { Editor } from "@tiptap/react";
import { useRef, useState } from "react";
import { Group, MenuTrigger, Separator, Toolbar, TooltipTrigger } from "react-aria-components";

import { useDocumentActions } from "@/hooks/use-document-actions";
import { useImageUpload } from "@/hooks/use-image-upload";

import { Button } from "../generic/Button";
import { Menu, MenuItem } from "../generic/Menu";
import { Tooltip } from "../generic/Tooltip";
import { DocumentSettingsDialog } from "./DocumentSettingsDialog";
import {
  BoldIcon,
  CodeIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  TableIcon,
  TaskListIcon,
} from "./wysiwyg-icons";

type Props = {
  editor: Editor;
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  onAddLink?: () => void;
};

export function EditorToolbar({ editor, doc, onAddLink }: Props) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { deleteDocument, publishDocument, unpublishDocument } = useDocumentActions();
  const { uploadImage } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const mod = isMac ? "⌘" : "Ctrl";

  const handlePublish = async () => {
    publishDocument(doc.id);
  };

  const handleUnpublish = async () => {
    unpublishDocument(doc.id);
  };

  return (
    <div className="flex justify-between items-center p-1 border-b border-gray-200 gap-1">
      <Toolbar aria-label="Editor formatting" className="flex items-center">
        <div className="flex items-center">
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

          <Group aria-label="Text style" className="flex items-center gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleBold().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Bold"
                className={editor.isActive("bold") ? "bg-gray-200" : ""}
              >
                <BoldIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom" hotkeys={[mod, "B"]}>
                Bold
              </Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleItalic().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Italic"
                className={editor.isActive("italic") ? "bg-gray-200" : ""}
              >
                <ItalicIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom" hotkeys={[mod, "I"]}>
                Italic
              </Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleStrike().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Strike"
                className={editor.isActive("strike") ? "bg-gray-200" : ""}
              >
                <TextStrikethroughFilled className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom" hotkeys={[mod, "Shift", "S"]}>
                Strike
              </Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleCode().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Code"
                className={editor.isActive("code") ? "bg-gray-200" : ""}
              >
                <CodeIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom" hotkeys={[mod, "E"]}>
                Code
              </Tooltip>
            </TooltipTrigger>
          </Group>

          <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

          <Group aria-label="Heading level" className="flex items-center gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Heading 1"
                className={editor.isActive("heading", { level: 1 }) ? "bg-gray-200" : ""}
              >
                <H1Icon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Heading 1</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Heading 2"
                className={editor.isActive("heading", { level: 2 }) ? "bg-gray-200" : ""}
              >
                <H2Icon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Heading 2</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Heading 3"
                className={editor.isActive("heading", { level: 3 }) ? "bg-gray-200" : ""}
              >
                <H3Icon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Heading 3</Tooltip>
            </TooltipTrigger>
          </Group>

          <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

          <Group aria-label="List format" className="flex items-center gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleBulletList().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Bullet List"
                className={editor.isActive("bulletList") ? "bg-gray-200" : ""}
              >
                <ListFilled className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Bullet List</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleOrderedList().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Ordered List"
                className={editor.isActive("orderedList") ? "bg-gray-200" : ""}
              >
                <TextNumberListLtrFilled className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Ordered List</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleTaskList().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Task List"
                className={editor.isActive("taskList") ? "bg-gray-200" : ""}
              >
                <TaskListIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Task List</Tooltip>
            </TooltipTrigger>
          </Group>

          <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

          <Group aria-label="Link" className="flex items-center gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => {
                  if (onAddLink) {
                    onAddLink();
                  }
                }}
                intent="ghost"
                size="icon-sm"
                aria-label="Add Link"
                isDisabled={editor.state.selection.empty}
                className={editor.isActive("link") ? "bg-gray-200" : ""}
              >
                <LinkIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Add Link</Tooltip>
            </TooltipTrigger>
          </Group>

          <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

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
                  const alt = prompt("Enter alt text for the image (optional):") || "";
                  editor.chain().focus().setImage({ src: url, alt }).run();
                } catch (error) {
                  console.error("Failed to upload image:", error);
                  alert("Failed to upload image. Please try again.");
                } finally {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }
              }}
            />
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => {
                  fileInputRef.current?.click();
                }}
                intent="ghost"
                size="icon-sm"
                aria-label="Insert Image"
              >
                <ImageIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Insert Image</Tooltip>
            </TooltipTrigger>
          </Group>

          <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

          <Group aria-label="Table" className="flex gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                intent="ghost"
                size="icon-sm"
                aria-label="Insert Table"
                className={editor.isActive("table") ? "bg-gray-200" : ""}
              >
                <TableIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Insert Table</Tooltip>
            </TooltipTrigger>

            {/* Table management buttons - only show when in a table */}
            {editor.isActive("table") && (
              <>
                <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

                <MenuTrigger>
                  <TooltipTrigger delay={500}>
                    <Button intent="ghost" size="icon-sm" aria-label="Table Columns">
                      <ColumnRegular className="size-4" />
                    </Button>
                    <Tooltip placement="bottom">Table Columns</Tooltip>
                  </TooltipTrigger>
                  <Menu>
                    <MenuItem onAction={() => editor.chain().focus().addColumnBefore().run()}>
                      Add Column Before
                    </MenuItem>
                    <MenuItem onAction={() => editor.chain().focus().addColumnAfter().run()}>
                      Add Column After
                    </MenuItem>
                    <MenuItem onAction={() => editor.chain().focus().deleteColumn().run()}>
                      Delete Column
                    </MenuItem>
                    <MenuItem onAction={() => editor.chain().focus().toggleHeaderColumn().run()}>
                      Toggle Header Column
                    </MenuItem>
                  </Menu>
                </MenuTrigger>

                <MenuTrigger>
                  <TooltipTrigger delay={500}>
                    <Button intent="ghost" size="icon-sm" aria-label="Table Rows">
                      <RowChildFilled className="size-4" />
                    </Button>
                    <Tooltip placement="bottom">Table Rows</Tooltip>
                  </TooltipTrigger>
                  <Menu>
                    <MenuItem onAction={() => editor.chain().focus().addRowBefore().run()}>
                      Add Row Before
                    </MenuItem>
                    <MenuItem onAction={() => editor.chain().focus().addRowAfter().run()}>
                      Add Row After
                    </MenuItem>
                    <MenuItem onAction={() => editor.chain().focus().deleteRow().run()}>
                      Delete Row
                    </MenuItem>
                    <MenuItem onAction={() => editor.chain().focus().toggleHeaderRow().run()}>
                      Toggle Header Row
                    </MenuItem>
                  </Menu>
                </MenuTrigger>

                <TooltipTrigger delay={500}>
                  <Button
                    onPress={() => editor.chain().focus().mergeCells().run()}
                    intent="ghost"
                    size="icon-sm"
                    aria-label="Merge Cells"
                  >
                    <AddFilled className="size-[15px] text-gray-700" />
                  </Button>
                  <Tooltip placement="bottom">Merge Cells</Tooltip>
                </TooltipTrigger>
                <TooltipTrigger delay={500}>
                  <Button
                    onPress={() => editor.chain().focus().splitCell().run()}
                    intent="ghost"
                    size="icon-sm"
                    aria-label="Split Cell"
                  >
                    <SubtractFilled className="size-[15px] text-gray-700" />
                  </Button>
                  <Tooltip placement="bottom">Split Cell</Tooltip>
                </TooltipTrigger>
                <TooltipTrigger delay={500}>
                  <Button
                    onPress={() => editor.chain().focus().deleteTable().run()}
                    intent="ghost"
                    size="icon-sm"
                    aria-label="Delete Table"
                  >
                    <DeleteFilled className="size-[15px] text-gray-700" />
                  </Button>
                  <Tooltip placement="bottom">Delete Table</Tooltip>
                </TooltipTrigger>
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
        <Button
          onPress={doc.published ? handleUnpublish : handlePublish}
          intent="secondary"
          size="sm"
        >
          {doc.published ? "Unpublish" : "Publish"}
        </Button>
        <MenuTrigger>
          <Button intent="ghost" size="icon-sm" aria-label="Document Options">
            <MoreVerticalRegular className="size-3.5 text-gray-600" />
          </Button>
          <Menu>
            <MenuItem onAction={() => setIsSettingsOpen(true)}>Settings</MenuItem>
            <MenuItem onAction={() => deleteDocument(doc.id, true)}>Delete</MenuItem>
          </Menu>
        </MenuTrigger>
        <DocumentSettingsDialog
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          doc={doc}
        />
      </div>
    </div>
  );
}
