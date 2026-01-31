import type { Editor } from "@tiptap/react";

import { ChevronDownRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { DropdownItem } from "@lydie/ui/components/generic/ListBox";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { useEffect, useState } from "react";
import { ListBox, Select as AriaSelect, SelectValue } from "react-aria-components";

import { blockFormattingActions, getActiveBlockType } from "@/lib/editor/formatting-actions";

type Props = {
  editor: Editor;
};

export function BlockTypeDropdown({ editor }: Props) {
  const [activeBlockType, setActiveBlockType] = useState(() => getActiveBlockType(editor));

  useEffect(() => {
    const updateActiveBlockType = () => {
      setActiveBlockType(getActiveBlockType(editor));
    };

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

  return (
    <AriaSelect
      value={blockFormattingActions.find((a) => a.label === activeBlockType)?.id || "paragraph"}
      onChange={handleChange}
      aria-label="Block type"
    >
      <Button intent="ghost" size="sm">
        {blockFormattingActions.find((a) => a.label === activeBlockType)?.label || "Paragraph"}
        <ChevronDownRegular aria-hidden className="size-3.5 shrink-0 ml-2" />
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
