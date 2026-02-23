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
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { useEffect, useState } from "react";
import { TooltipTrigger } from "react-aria-components";

import { BlockTypeDropdown } from "./BlockTypeDropdown";

type Props = {
  editor: Editor;
};

type ActiveStates = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  blockquote: boolean;
  link: boolean;
  selectionEmpty: boolean;
};

export function BubbleMenu({ editor }: Props) {
  const [activeStates, setActiveStates] = useState<ActiveStates>({
    bold: false,
    italic: false,
    strike: false,
    code: false,
    blockquote: false,
    link: false,
    selectionEmpty: true,
  });

  // Track active states for all formatting options
  useEffect(() => {
    const updateActiveStates = () => {
      setActiveStates({
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        strike: editor.isActive("strike"),
        code: editor.isActive("code"),
        blockquote: editor.isActive("blockquote"),
        link: editor.isActive("link"),
        selectionEmpty: editor.state.selection.empty,
      });
    };

    // Update initially
    updateActiveStates();

    // Subscribe to editor updates
    editor.on("selectionUpdate", updateActiveStates);
    editor.on("update", updateActiveStates);

    return () => {
      editor.off("selectionUpdate", updateActiveStates);
      editor.off("update", updateActiveStates);
    };
  }, [editor]);

  return (
    <TiptapBubbleMenu
      editor={editor}
      shouldShow={({ editor: currentEditor, state, from, to }) => {
        if (!currentEditor.isEditable || state.selection.empty) {
          return false;
        }

        if (state.selection instanceof NodeSelection) {
          return state.selection.node.type.name !== "collectionViewBlock";
        }

        if (currentEditor.isActive("collectionViewBlock")) {
          return false;
        }

        if (state.doc.textBetween(from, to).trim().length === 0) {
          return false;
        }

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
          if (activeElement.closest('[data-type="collection-view-block"]')) {
            return false;
          }
        }

        const domSelection = window.getSelection();
        const anchorElement =
          domSelection?.anchorNode instanceof Element
            ? domSelection.anchorNode
            : domSelection?.anchorNode?.parentElement;

        if (anchorElement?.closest('[data-type="collection-block"]')) {
          return false;
        }

        return true;
      }}
      options={{
        placement: "bottom",
      }}
      className="dark bg-black/95 border border-white/20 rounded-[10px] shadow-popover p-1 flex items-center gap-1"
    >
      <BlockTypeDropdown editor={editor} />
      <Separator orientation="vertical" className="h-4" />
      <TooltipTrigger delay={500}>
        <Button
          onPress={() => editor.chain().focus().toggleBold().run()}
          intent="ghost"
          size="icon-sm"
          aria-label="Bold"
          className={activeStates.bold ? "bg-white/30" : ""}
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
          className={activeStates.italic ? "bg-white/30" : ""}
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
          className={activeStates.strike ? "bg-white/30" : ""}
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
          className={activeStates.code ? "bg-white/30" : ""}
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
          className={activeStates.blockquote ? "bg-white/30" : ""}
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
          isDisabled={activeStates.selectionEmpty}
          className={activeStates.link ? "bg-white/30" : ""}
        >
          <LinkIcon className="size-[15px]" />
        </Button>
        <Tooltip placement="bottom">Add Link</Tooltip>
      </TooltipTrigger>
    </TiptapBubbleMenu>
  );
}
