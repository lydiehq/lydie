import { mutators } from "@lydie/zero/mutators";
import { useAtom } from "jotai";
import { toast } from "sonner";

import { Label } from "@lydie/ui/components/generic/Field";
import { Select, SelectItem } from "@lydie/ui/components/generic/Select";
import { Switch } from "@lydie/ui/components/generic/Switch";
import { Card } from "@/components/layout/Card";
import { useZero } from "@/services/zero";
import { FONT_SIZE_MAP, type FontSizeOption, rootFontSizeAtom } from "@/stores/font-size";

type UserSettings = {
  persist_document_tree_expansion: boolean | null;
};

type PreferencesSectionProps = {
  userSettings: UserSettings;
};

export function PreferencesSection({ userSettings }: PreferencesSectionProps) {
  const z = useZero();
  const [fontSize, setFontSize] = useAtom(rootFontSizeAtom);

  const handleTogglePersistDocumentTreeExpansion = async (isSelected: boolean) => {
    try {
      z.mutate(
        mutators.userSettings.update({
          persistDocumentTreeExpansion: isSelected,
        }),
      );
      toast.success(
        isSelected
          ? "Document tree expansion will be saved"
          : "Document tree expansion will not be saved",
      );
    } catch (error) {
      toast.error("Failed to update preference");
      console.error("Settings update error:", error);
    }
  };

  return (
    <Card className="p-4 flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-y-1">
          <Label
            id="persist-document-tree-expansion-label"
            className="text-sm font-medium text-gray-900"
          >
            Persist Document Tree Expansion
          </Label>
          <p className="text-xs text-gray-500">
            Save the expanded state of documents in the document tree to local storage. When
            enabled, your expanded folders will remain open after refreshing the page.
          </p>
        </div>
        <Switch
          aria-labelledby="persist-document-tree-expansion-label"
          isSelected={userSettings.persist_document_tree_expansion ?? true}
          onChange={handleTogglePersistDocumentTreeExpansion}
        />
      </div>

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
