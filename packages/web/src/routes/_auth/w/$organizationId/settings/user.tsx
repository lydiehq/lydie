import { createFileRoute } from "@tanstack/react-router";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useZero } from "@/services/zero";
import { Switch } from "@/components/generic/Switch";
import { toast } from "sonner";
import { Label } from "@/components/generic/Field";
import { useAtom } from "jotai";
import {
  rootFontSizeAtom,
  FONT_SIZE_MAP,
  type FontSizeOption,
} from "@/stores/font-size";
import { Select, SelectItem } from "@/components/generic/Select";
import { mutators } from "@lydie/zero/mutators";
import { Card } from "@/components/layout/Card";

export const Route = createFileRoute("/_auth/w/$organizationId/settings/user")(
  {
    component: RouteComponent,
  }
);

function RouteComponent() {
  const z = useZero();

  const [userSettings] = useQuery(queries.settings.user({}));
  const [fontSize, setFontSize] = useAtom(rootFontSizeAtom);

  const handleTogglePersistDocumentTreeExpansion = async (
    isSelected: boolean
  ) => {
    try {
      z.mutate(
        mutators.userSettings.update({
          persistDocumentTreeExpansion: isSelected,
        })
      );
      toast.success(
        isSelected
          ? "Document tree expansion will be saved"
          : "Document tree expansion will not be saved"
      );
    } catch (error) {
      toast.error("Failed to update preference");
      console.error("Settings update error:", error);
    }
  };

  if (!userSettings) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>User Settings</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>User Settings</Heading>
      </div>
      <Separator />

      {/* Preferences Section */}
      <div className="flex flex-col gap-y-6">
        <div className="flex flex-col gap-y-0.5">
          <h2 className="text-md/none font-medium">Preferences</h2>
          <p className="text-sm/relaxed text-gray-700">
            Customize your personal preferences and settings.
          </p>
        </div>

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
                Save the expanded state of folders in the document tree to local
                storage. When enabled, your expanded folders will remain open
                after refreshing the page.
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
              <Label
                id="root-font-size-label"
                className="text-sm font-medium text-gray-900"
              >
                Root Font Size
              </Label>
              <p className="text-xs text-gray-500">
                Adjust the base font size for the entire application. This
                affects all text sizes since they use REM units. Changes are
                saved locally and persist across sessions.
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
      </div>
    </div>
  );
}
