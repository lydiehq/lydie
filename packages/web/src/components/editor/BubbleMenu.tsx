import type { Editor } from "@tiptap/core";

import { TextStrikethroughFilled } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip } from "@lydie/ui/components/generic/Tooltip";
import {
  BlockquoteIcon,
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
} from "@lydie/ui/components/icons/wysiwyg-icons";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { TooltipTrigger } from "react-aria-components";

import { BlockTypeDropdown } from "./BlockTypeDropdown";

type Props = {
  editor: Editor;
};

export function BubbleMenu({ editor }: Props) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      options={{
        placement: "bottom",
      }}
      className="dark z-100 bg-black/95 border border-white/20 rounded-full shadow-popover p-1 flex items-center gap-1"
    >
      <BlockTypeDropdown editor={editor} />
      <Separator orientation="vertical" className="h-4" />
      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.chain().focus().toggleBold().run()}
          intent="ghost"
          size="icon-sm"
          aria-label="Bold"
          className={editor.isActive("bold") ? "bg-white/30" : ""}
        >
          <BoldIcon className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Bold</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.chain().focus().toggleItalic().run()}
          intent="ghost"
          size="icon-sm"
          aria-label="Italic"
          className={editor.isActive("italic") ? "bg-white/30" : ""}
        >
          <ItalicIcon className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Italic</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.chain().focus().toggleStrike().run()}
          intent="ghost"
          size="icon-sm"
          aria-label="Strike"
          className={editor.isActive("strike") ? "bg-white/30" : ""}
        >
          <TextStrikethroughFilled className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Strike</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.chain().focus().toggleCode().run()}
          intent="ghost"
          size="icon-sm"
          aria-label="Code"
          className={editor.isActive("code") ? "bg-white/30" : ""}
        >
          <CodeIcon className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Code</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.chain().focus().toggleBlockquote().run()}
          intent="ghost"
          size="icon-sm"
          aria-label="Blockquote"
          className={editor.isActive("blockquote") ? "bg-white/30" : ""}
        >
          <BlockquoteIcon className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Blockquote</Tooltip>
      </TooltipTrigger>

      <Separator orientation="vertical" className="h-4" />

      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.commands.openLinkPopover()}
          intent="ghost"
          size="icon-sm"
          aria-label="Add Link"
          isDisabled={editor.state.selection.empty}
          className={editor.isActive("link") ? "bg-white/30" : ""}
        >
          <LinkIcon className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Add Link</Tooltip>
      </TooltipTrigger>
    </TiptapBubbleMenu>
  );
}
