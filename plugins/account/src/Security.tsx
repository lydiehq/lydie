import { useAccount, useApp, useHostedQuery } from "@lydie/plugin-api";
import {
  Button,
  SettingsCard,
  SettingsCardBlock,
  SettingsCardEmpty,
  SettingsListItem,
  SettingsRow,
  SettingsSection,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { errorMessage, relativeTime } from "./format.ts";
import { TwoFactorDialog } from "./TwoFactorDialog.tsx";
import type { TwoFactorAction } from "./TwoFactorDialog.tsx";

// Two-step verification and where the account is signed in (hosted accounts, signed in).
export function SecuritySections() {
  return (
    <>
      <TwoFactorSection />
      <DevicesSection />
    </>
  );
}

function TwoFactorSection() {
  const { api, state } = useAccount();
  const [action, setAction] = useState<TwoFactorAction | null>(null);
  const twoFactor = api?.twoFactor ?? null;
  // null while unknown (or offline): the row then offers nothing it might have to take back.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    if (!twoFactor) return;
    let live = true;
    twoFactor.hasPassword().then(
      (has) => live && setHasPassword(has),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [twoFactor]);
  if (!twoFactor || state.status !== "signed-in") return null;
  const on = state.user.twoFactorEnabled === true;
  return (
    <SettingsSection title="Security">
      <SettingsCard>
        <SettingsRow
          label="Two-step verification"
          description={
            hasPassword === false
              ? "You sign in with Google, so your Google account's own security protects Lydie."
              : on
                ? "On. Signing in with your password also asks for a code from your authenticator app. Signing in with Google relies on your Google account."
                : "Ask for a code from an authenticator app when you sign in with your password."
          }
        >
          <span className="sr-only" data-testid="two-factor-status">
            {on ? "on" : "off"}
          </span>
          {hasPassword &&
            (on ? (
              <>
                <Button size="sm" variant="secondary" onPress={() => setAction("backupCodes")}>
                  New backup codes…
                </Button>
                <Button size="sm" variant="secondary" onPress={() => setAction("disable")}>
                  Turn off…
                </Button>
              </>
            ) : (
              <Button size="sm" onPress={() => setAction("enable")}>
                Turn on…
              </Button>
            ))}
        </SettingsRow>
      </SettingsCard>
      {action && <TwoFactorDialog action={action} close={() => setAction(null)} />}
    </SettingsSection>
  );
}

function DevicesSection() {
  const app = useApp();
  const { api, state } = useAccount();
  const signedIn = state.status === "signed-in";
  const sessions = useHostedQuery("authSession.list", signedIn ? {} : null);
  const [error, setError] = useState<string | null>(null);
  if (!api || !signedIn) return null;
  // This device first, then the rest as the server orders them (most recently active first).
  const list = [...(sessions.data?.sessions ?? [])].sort(
    (x, y) => Number(y.current) - Number(x.current),
  );
  const others = list.filter((s) => !s.current);

  const signOut = async (ids: string[], all: boolean) => {
    setError(null);
    sessions.setData((d) => d && { sessions: d.sessions.filter((s) => !ids.includes(s.id)) });
    try {
      if (all) await api.call("authSession.revokeOthers", {});
      else await Promise.all(ids.map((id) => api.call("authSession.revoke", { sessionId: id })));
    } catch (e) {
      setError(errorMessage(e));
    }
    await sessions.reload();
  };

  return (
    <SettingsSection
      title="Signed-in devices"
      description="Where your account is signed in. Sign out a device you do not recognise or no longer use."
    >
      <SettingsCard>
        {sessions.error && !sessions.data ? (
          <SettingsCardEmpty role="alert">{errorMessage(sessions.error)}</SettingsCardEmpty>
        ) : sessions.isLoading && !sessions.data ? (
          <SettingsCardEmpty>Loading…</SettingsCardEmpty>
        ) : (
          list.map((s) => (
            <SettingsListItem
              key={s.id}
              data-testid="signed-in-device"
              title={s.device}
              meta={[
                s.current ? "This device" : `Active ${relativeTime(s.lastActiveAt)}`,
                s.ipAddress,
                `Signed in ${new Date(s.createdAt).toLocaleDateString()}`,
              ]}
              trailing={
                !s.current && (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Sign out ${s.device}`}
                    onPress={async () => {
                      if (
                        !(await app.confirm({
                          message: `Sign out ${s.device}?`,
                          detail:
                            "It has to sign in again to sync. Changes it has not synced yet stay on it.",
                          confirmLabel: "Sign out",
                          destructive: true,
                        }))
                      )
                        return;
                      await signOut([s.id], false);
                    }}
                  >
                    Sign out
                  </Button>
                )
              }
            />
          ))
        )}
        {(others.length > 1 || error) && (
          <SettingsCardBlock className="flex items-center justify-between gap-2">
            {error ? (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            ) : (
              <span />
            )}
            {others.length > 1 && (
              <Button
                size="sm"
                variant="secondary"
                onPress={async () => {
                  if (
                    !(await app.confirm({
                      message: "Sign out every other device?",
                      detail: "Only this device stays signed in.",
                      confirmLabel: "Sign out all",
                      destructive: true,
                    }))
                  )
                    return;
                  await signOut(
                    others.map((s) => s.id),
                    true,
                  );
                }}
              >
                Sign out all other devices
              </Button>
            )}
          </SettingsCardBlock>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
