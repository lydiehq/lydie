import {
  useAccount,
  useApp,
  useDeviceSetting,
  useQuerySelect,
  useStatus,
  useWorkspace,
  useWorkspaceImage,
} from "@lydie/plugin-api";
import {
  AvatarEditor,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  SettingsCard,
  SettingsCardBlock,
  SettingsRow,
  SettingsSection,
  SettingsSections,
  SettingsTextInput,
  Switch,
} from "@lydie/plugin-api/ui";
import { useState } from "react";

import { DEFAULTS, FONT_SIZES, LINE_WIDTHS, PREFS } from "../preferences.ts";
import type { LineWidth, Theme } from "../preferences.ts";
import { PrivacySection } from "../PrivacySetting.tsx";

// A synced workspace's picture, beside its name in the sidebar and the workspace list. Owners and
// admins change it.
function WorkspacePicture() {
  const app = useApp();
  const workspace = useWorkspace();
  const image = useWorkspaceImage();
  const { api, state } = useAccount();
  const me = state.status === "signed-out" ? null : state.user.id;
  const role = useQuerySelect(
    "workspace.members",
    { workspaceId: workspace.workspaceId },
    (members) => members.data.find((m) => m.userId === me)?.role ?? null,
  );
  const canChange = role === "owner" || role === "admin";
  // What was saved, until the synced row catches up (it still holds `over`).
  const [saved, setSaved] = useState<{ image: string | null; over: string | null } | null>(null);
  return (
    <SettingsCardBlock data-testid="workspace-picture">
      <AvatarEditor
        seed={workspace.workspaceName}
        image={saved && saved.over === image ? saved.image : image}
        shape="squircle"
        title="Picture"
        description={
          canChange
            ? "Everyone in the workspace sees it beside its name."
            : "Owners and admins can change it."
        }
        readOnly={!api || !canChange}
        onSave={async (next) => {
          try {
            await api!.call("workspace.setImage", {
              workspaceId: workspace.workspaceId,
              image: next,
            });
            setSaved({ image: next, over: image });
            app.notify({ title: "Workspace picture saved" });
          } catch (error) {
            app.notify({
              title: "Could not save the workspace picture",
              description: error instanceof Error ? error.message : String(error),
              kind: "error",
            });
            throw error;
          }
        }}
      />
    </SettingsCardBlock>
  );
}

export function GeneralPage() {
  const app = useApp();
  const workspace = useWorkspace();
  const status = useStatus();
  const { api } = useAccount();
  const [theme, setTheme] = useDeviceSetting<Theme>(PREFS.theme, DEFAULTS.theme);
  const [fontSize, setFontSize] = useDeviceSetting(PREFS.fontSize, DEFAULTS.fontSize);
  const [lineWidth, setLineWidth] = useDeviceSetting<LineWidth>(
    PREFS.lineWidth,
    DEFAULTS.lineWidth,
  );
  const [spellcheck, setSpellcheck] = useDeviceSetting(PREFS.spellcheck, DEFAULTS.spellcheck);

  const hosted = api?.scope.kind === "hosted";
  const rename = hosted
    ? (name: string) => api.call("workspace.rename", { workspaceId: workspace.workspaceId, name })
    : app.services?.renameWorkspace;

  return (
    <SettingsSections>
      <SettingsSection title="Workspace">
        <SettingsCard>
          {hosted && <WorkspacePicture />}
          <SettingsRow
            label="Name"
            htmlFor="settings-workspace-name"
            description={
              rename
                ? hosted
                  ? "Everyone in the workspace sees it. Applies when the window reopens."
                  : "Applies when the window reopens."
                : "This workspace's name is set by its folder."
            }
          >
            <SettingsTextInput
              id="settings-workspace-name"
              value={workspace.workspaceName}
              required
              disabled={!rename}
              onSave={async (name) => {
                await rename?.(name);
              }}
            />
          </SettingsRow>
          <SettingsRow label="Stored">
            <span className="text-sm text-gray-600">
              {workspace.mode === "synced"
                ? "In your account, with a copy on this device"
                : workspace.persistent
                  ? "On this device"
                  : "In memory only (lost when the tab closes)"}
            </span>
          </SettingsRow>
          <SettingsRow label="Sync">
            <span className="text-sm text-gray-600">
              {status.sync === "local-only" ? "Off" : status.sync}
            </span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Appearance" description="Applies to this device.">
        <SettingsCard>
          <SettingsRow label="Theme">
            <RadioGroup
              aria-label="Theme"
              orientation="horizontal"
              value={theme}
              onChange={(value) => setTheme(value as Theme)}
            >
              <Radio value="light">Light</Radio>
              <Radio value="dark">Dark</Radio>
              <Radio value="system">System</Radio>
            </RadioGroup>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Editor" description="Applies to this device.">
        <SettingsCard>
          <SettingsRow label="Font size">
            <Select
              aria-label="Font size"
              className="w-36"
              selectedKey={String(fontSize)}
              onSelectionChange={(key) => setFontSize(Number(key))}
            >
              {FONT_SIZES.map((size) => (
                <SelectItem key={size} id={String(size)}>
                  {`${size} px`}
                </SelectItem>
              ))}
            </Select>
          </SettingsRow>
          <SettingsRow label="Line width" description="How wide the text column is.">
            <Select
              aria-label="Line width"
              className="w-36"
              selectedKey={lineWidth}
              onSelectionChange={(key) => setLineWidth(key as LineWidth)}
            >
              {Object.entries(LINE_WIDTHS).map(([id, width]) => (
                <SelectItem key={id} id={id}>
                  {width.label}
                </SelectItem>
              ))}
            </Select>
          </SettingsRow>
          <SettingsRow label="Check spelling" description="Underline misspelled words.">
            <Switch aria-label="Check spelling" isSelected={spellcheck} onChange={setSpellcheck} />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <PrivacySection />
    </SettingsSections>
  );
}
