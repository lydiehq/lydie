import { Label } from "@lydie/ui/components/generic/Field";
import { Select, SelectItem } from "@lydie/ui/components/generic/Select";
import { useAtom } from "jotai";

import { editorFontSizeAtom } from "@/atoms/workspace-settings";
import { Card } from "@/components/layout/Card";
import { FONT_SIZE_MAP, type FontSizeOption } from "@/atoms/font-size";

export function PreferencesSection() {
  const [fontSize, setFontSize] = useAtom(editorFontSizeAtom);

  return (
    <Card className="p-4 flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-1">
          <Label id="root-font-size-label" className="text-sm font-medium text-gray-900">
            Root Font Size
          </Label>
          <p className="text-xs text-gray-500">
            Adjust the base font size for the entire application. This affects all text sizes since
            they use REM units. Changes are saved locally and persist across sessions.
          </p>
        </div>
        <div className="w-48">
          <Select
            label=""
            selectedKey={fontSize}
            onSelectionChange={(key) => {
              if (key && typeof key === "string") {
                setFontSize(key as FontSizeOption);
              }
            }}
            items={Object.keys(FONT_SIZE_MAP).map((size) => ({
              id: size,
              label: size === "default" ? "Default" : size.toUpperCase(),
            }))}
          >
            {(item) => (
              <SelectItem id={item.id} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
        </div>
      </div>
    </Card>
  );
}
