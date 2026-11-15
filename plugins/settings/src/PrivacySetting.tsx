// The desktop app's privacy settings: the app lock (LYD-383) and privacy mode (LYD-382), which
// leaves the app's windows out of screenshots, screen recordings, screen sharing and window
// previews. Nothing where the shell cannot do them.
import { useApp } from "@lydie/plugin-api";
import { SettingsCard, SettingsRow, SettingsSection, Switch } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { AppLockRows } from "./AppLockSetting.tsx";

export function PrivacySection() {
  const app = useApp();
  const control = app.screenCapture;
  const [state, setState] = useState<{ blocked: boolean; supported: boolean } | null>(null);
  useEffect(() => {
    if (!control) return;
    let live = true;
    void control.state().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [control]);
  if (!app.appLock && !(control && state)) return null;
  return (
    <SettingsSection title="Privacy" description="Applies to this device.">
      <SettingsCard>
        {app.appLock && <AppLockRows lock={app.appLock} />}
        {control && state && (
          <SettingsRow
            label="Hide from screen sharing"
            description={
              state.supported
                ? "Lydie's windows show as blank in screenshots, screen recordings, screen sharing and window previews."
                : "Not available on Linux: the system does not let apps hide their windows from screen capture."
            }
          >
            <Switch
              aria-label="Hide from screen sharing"
              isSelected={state.blocked}
              isDisabled={!state.supported}
              onChange={async (blocked) => {
                setState({ ...state, blocked });
                await control.setBlocked(blocked).catch(() => setState(state));
              }}
            />
          </SettingsRow>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
