import { WORKSPACE_COLORS } from "@lydie/core/workspace-colors";
import { Radio, RadioGroup } from "react-aria-components";

import { Label } from "@lydie/ui/components/generic/Field";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";

type OrganizationColorPickerProps = {
  selectedColor: string;
  onColorChange: (color: string) => void;
};

export function OrganizationColorPicker({
  selectedColor,
  onColorChange,
}: OrganizationColorPickerProps) {
  return (
    <div className="flex flex-col gap-y-2">
      <Label>Workspace Color</Label>
      <RadioGroup
        value={selectedColor}
        onChange={onColorChange}
        orientation="horizontal"
        className="flex gap-3"
      >
        {WORKSPACE_COLORS.slice(0, 10).map((color) => {
          return (
            <TooltipTrigger key={color.value} delay={500}>
              <Radio
                value={color.value}
                className="flex items-center justify-center"
                aria-label={`Select color ${color.name}`}
              >
                {({ isSelected }) => (
                  <div
                    className={`p-1 border border-black/8 bg-white rounded-full ${
                      isSelected ? "ring-2 ring-gray-200 ring-offset-2 shadow-surface" : ""
                    }`}
                  >
                    <div
                      className="size-5 rounded-full"
                      style={{
                        backgroundColor: color.value,
                      }}
                    />
                  </div>
                )}
              </Radio>
              <Tooltip placement="bottom">{color.name}</Tooltip>
            </TooltipTrigger>
          );
        })}
      </RadioGroup>
    </div>
  );
}
