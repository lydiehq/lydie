import type { Editor } from "@tiptap/core";

import { SparkleRegular, TextStrikethroughFilled } from "@fluentui/react-icons";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";

import { Separator } from "../generic/Separator";
import { ToolbarButton } from "./toolbar/ToolbarButton";
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon } from "./wysiwyg-icons";

type Props = {
  editor: Editor;
  onAddLink?: () => void;
};

export function BubbleMenu({ editor, onAddLink }: Props) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      options={{
        placement: "bottom",
      }}
      className="z-50 bg-white ring ring-black/10 rounded-lg shadow-lg p-1 flex items-center gap-1"
    >
      {/* Formatting buttons */}
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
        icon={BoldIcon}
        editor={editor}
      />
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
        icon={ItalicIcon}
        editor={editor}
      />
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleStrike().run()}
        title="Strike"
        icon={TextStrikethroughFilled}
        editor={editor}
      />
      <ToolbarButton
        onPress={() => editor.chain().focus().toggleCode().run()}
        title="Code"
        icon={CodeIcon}
        editor={editor}
      />

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Link button */}
      <ToolbarButton
        onPress={() => {
          if (onAddLink) {
            onAddLink();
          }
        }}
        title="Add Link"
        icon={LinkIcon}
        editor={editor}
        isDisabled={editor.state.selection.empty}
      />

      <Separator orientation="vertical" className="h-4 mx-1" />

      <ToolbarButton
        onPress={() => {
          editor.commands.captureAndMarkSelection();
        }}
        title="Add to context"
        icon={SparkleRegular}
        editor={editor}
        className="flex p-1.5 rounded hover:bg-gray-100"
      />
    </TiptapBubbleMenu>
  );
}
