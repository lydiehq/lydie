import { useApp } from "@lydie/plugin-api";
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
import { useState } from "react";

export function PluginsPage() {
  const app = useApp();
  const api = app.plugins;
  const [list, setList] = useState(() => api?.list() ?? []);
  // What was on when the window opened: a change applies only after it reopens.
  const [initial] = useState(() => new Map(list.map((p) => [p.id, p.enabled])));
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
