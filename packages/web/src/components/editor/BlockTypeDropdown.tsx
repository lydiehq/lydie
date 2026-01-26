import type { Editor } from "@tiptap/react";

import { ChevronDownRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Button, ListBox, Select as AriaSelect, SelectValue } from "react-aria-components";

import { blockFormattingActions, getActiveBlockType } from "@/lib/editor/formatting-actions";

import { DropdownItem } from "../generic/ListBox";
import { Popover } from "../generic/Popover";

type Props = {
  editor: Editor;
  variant?: "toolbar" | "bubble";
};

export function BlockTypeDropdown({ editor, variant = "toolbar" }: Props) {
  const [activeBlockType, setActiveBlockType] = useState(() => getActiveBlockType(editor));

  useEffect(() => {
    const updateActiveBlockType = () => {
      setActiveBlockType(getActiveBlockType(editor));
    };

    // Update on editor updates and selection changes
    editor.on("update", updateActiveBlockType);
    editor.on("selectionUpdate", updateActiveBlockType);

    return () => {
      editor.off("update", updateActiveBlockType);
      editor.off("selectionUpdate", updateActiveBlockType);
    };
  }, [editor]);

  const handleChange = (key: React.Key | null) => {
    const action = blockFormattingActions.find((a) => a.id === key);
    if (action) {
      action.execute(editor);
    }
  };

  const buttonStyles =
    variant === "bubble"
      ? "flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/20 text-white text-xs font-medium min-w-[100px]"
      : "flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200 bg-white min-w-[110px]";

  return (
    <AriaSelect
      value={blockFormattingActions.find((a) => a.label === activeBlockType)?.id || "paragraph"}
      onChange={handleChange}
      aria-label="Block type"
    >
      <Button className={buttonStyles}>
        <SelectValue className="flex-1 text-start" />
        <ChevronDownRegular
          aria-hidden
          className={variant === "bubble" ? "size-3.5 text-white" : "size-3.5 text-gray-600"}
        />
      </Button>
      <Popover className="min-w-(--trigger-width)">
        <ListBox className="outline-hidden p-1 max-h-[inherit] overflow-auto [clip-path:inset(0_0_0_0_round_.75rem)]">
          {blockFormattingActions.map((action) => (
            <DropdownItem key={action.id} id={action.id}>
              {action.label}
            </DropdownItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
