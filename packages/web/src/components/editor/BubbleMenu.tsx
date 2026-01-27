import type { Editor } from "@tiptap/core";

import { TextStrikethroughFilled } from "@fluentui/react-icons";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";

import { Separator } from "../generic/Separator";
import { BlockTypeDropdown } from "./BlockTypeDropdown";
import { ToolbarButton } from "./toolbar/ToolbarButton";
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon } from "./wysiwyg-icons";

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
      className="z-100 bg-black/85 text-white rounded-lg shadow-popover p-1 flex items-center gap-1"
    >
      {/* Block type dropdown */}
      <BlockTypeDropdown editor={editor} variant="bubble" />

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Formatting buttons */}
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
        icon={BoldIcon}
        editor={editor}
        inverted
      />
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
        icon={ItalicIcon}
        editor={editor}
        inverted
      />
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleStrike().run()}
        title="Strike"
        icon={TextStrikethroughFilled}
        editor={editor}
        inverted
      />
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleCode().run()}
        title="Code"
        icon={CodeIcon}
        editor={editor}
        inverted
      />

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Link button - uses editor command to open link popover */}
      <ToolbarButton
        onPress={() => editor.commands.openLinkPopover()}
        title="Add Link"
        icon={LinkIcon}
        editor={editor}
        isDisabled={editor.state.selection.empty}
        inverted
      />

      <Separator orientation="vertical" className="h-4 mx-1" />
    </TiptapBubbleMenu>
  );
}
