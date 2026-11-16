import { useApp } from "@lydie/plugin-api";
import type { PluginInfo, PluginPermission } from "@lydie/plugin-api";
import {
  Button,
  EmptyState,
  settingsBoxBleedClass,
  SettingsCard,
  SettingsListItem,
  SettingsSection,
  StatusBanner,
  Switch,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

// What each permission lets a plugin use, in Settings → Plugins.
const PERMISSION_LABELS: Record<PluginPermission, string> = {
  account: "your account",
  vault: "the open folder",
  device: "the app lock, privacy mode and shortcuts",
  plugins: "turning plugins on and off",
};

export function PluginsPage() {
  const app = useApp();
  const api = app.plugins;
  const [list, setList] = useState(() => api?.list() ?? []);
  // What was on when the window opened: a change applies only after it reopens.
  const [initial] = useState(() => new Map(list.map((p) => [p.id, p.enabled])));
  // A plugin that loads after the page opened may still fail to start.
  useEffect(() => api?.subscribe?.(() => setList(api.list())), [api]);
  if (!api) return <EmptyState title="Plugins cannot be changed in this window" />;
  const changed = list.some((p) => initial.get(p.id) !== p.enabled);
  return (
    <SettingsSection
      title="Built-in plugins"
      description="Every feature of Lydie is a plugin. Turned-off plugins stay off on this device."
    >
      {changed && (
        <StatusBanner
          kind="info"
          variant="card"
          className={`${settingsBoxBleedClass} px-4`}
          action={
            <Button size="xs" variant="secondary" onPress={() => window.location.reload()}>
              Reload now
            </Button>
          }
        >
          Changes apply when the window reloads.
        </StatusBanner>
      )}
      <SettingsCard>
        {list.map((plugin) => (
          <SettingsListItem
            key={plugin.id}
            title={plugin.name}
            meta={[plugin.description, plugin.essential ? "Always on" : null]}
            note={
              plugin.permissions.length > 0 || plugin.error ? <PluginNote plugin={plugin} /> : null
            }
            trailing={
              <Switch
                aria-label={`${plugin.name} plugin`}
                isSelected={plugin.enabled}
                isDisabled={plugin.essential}
                onChange={(enabled) => {
                  api.setEnabled(plugin.id, enabled);
                  setList(api.list());
                }}
              />
            }
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

// What it may use beyond documents, and why it did not start in this window.
function PluginNote({ plugin }: { plugin: PluginInfo }) {
  return (
    <>
      {plugin.permissions.length > 0 && (
        <p>Uses {plugin.permissions.map((p) => PERMISSION_LABELS[p]).join(", ")}</p>
      )}
      {plugin.error && (
        <p role="alert" className="text-red-700">
          Did not start: {plugin.error}
        </p>
      )}
    </>
  );
}
