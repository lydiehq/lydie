import {
  ListFilled,
  TextNumberListLtrFilled,
  TextStrikethroughFilled,
} from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip } from "@lydie/ui/components/generic/Tooltip";
import {
  BlockquoteIcon,
  BoldIcon,
  CodeIcon,
  ItalicIcon,
} from "@lydie/ui/components/icons/wysiwyg-icons";
import type { Editor } from "@tiptap/react";
import { Group, Separator, Toolbar, TooltipTrigger } from "react-aria-components";

type Props = {
  editor: Editor;
};

type ActiveStates = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
};

export function SimpleEditorToolbar({ editor }: Props) {
  const activeStates: ActiveStates = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    blockquote: editor.isActive("blockquote"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
  };

  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <div className="flex items-center p-1 border-b border-gray-200 bg-gray-50 gap-1">
      <Toolbar aria-label="Editor formatting" className="flex items-center">
        <div className="flex items-center">
          <Group aria-label="Text style" className="flex items-center gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleBold().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Bold"
                className={activeStates.bold ? "bg-gray-200" : ""}
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
                className={activeStates.italic ? "bg-gray-200" : ""}
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
                className={activeStates.strike ? "bg-gray-200" : ""}
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
                className={activeStates.code ? "bg-gray-200" : ""}
              >
                <CodeIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom" hotkeys={[mod, "E"]}>
                Code
              </Tooltip>
            </TooltipTrigger>
          </Group>

          <Separator orientation="vertical" className="mx-1 h-6 w-px bg-gray-200" />

          <Group aria-label="Block format" className="flex items-center gap-1">
            <TooltipTrigger delay={500}>
              <Button
                onPress={() => editor.chain().focus().toggleBlockquote().run()}
                intent="ghost"
                size="icon-sm"
                aria-label="Blockquote"
                className={activeStates.blockquote ? "bg-gray-200" : ""}
              >
                <BlockquoteIcon className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Blockquote</Tooltip>
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
                className={activeStates.bulletList ? "bg-gray-200" : ""}
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
                className={activeStates.orderedList ? "bg-gray-200" : ""}
              >
                <TextNumberListLtrFilled className="size-[15px] text-gray-700" />
              </Button>
              <Tooltip placement="bottom">Ordered List</Tooltip>
            </TooltipTrigger>
          </Group>
        </div>
      </Toolbar>
    </div>
  );
}
