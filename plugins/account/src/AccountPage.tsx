import { useAccount, useApp, useObservable } from "@lydie/plugin-api";
import {
  Avatar,
  Button,
  EmptyState,
  SettingsCard,
  SettingsCardBlock,
  SettingsRow,
  SettingsSection,
  SettingsSections,
  SyncIllustration,
} from "@lydie/plugin-api/ui";

import { AvatarCard } from "./AvatarCard.tsx";
import { SecuritySections } from "./Security.tsx";
import { toCloud } from "./sign-up.ts";
import { SyncDetailsBody } from "./SyncStatus.tsx";

export function AccountPage() {
  const app = useApp();
  const { api, state } = useAccount();
  const details = useObservable(api?.sync?.details);
  if (!api) return <EmptyState title="Accounts are not available in this window" />;
  if (state.status === "signed-out") {
    return (
      <EmptyState
        title="Not signed in"
        illustration={<SyncIllustration />}
        description="Sign in to Lydie Cloud to keep your notes on all your devices and write with your team."
        action={
          <div className="flex gap-2">
            <Button size="sm" onPress={() => app.overlays.open("account.signIn")}>
              Sign in
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => app.overlays.open("account.signIn", { mode: "sign-up" })}
            >
              Create an account
            </Button>
          </div>
        }
      />
    );
  }
  return (
    <SettingsSections>
      <SettingsSection title="Account">
        <AvatarCard api={api} user={state.user} />
        <SettingsCard>
          <SettingsRow label="Name">
            <span className="flex items-center gap-2 text-sm text-gray-600">
              <Avatar seed={state.user.id} image={state.user.image} size={20} />
              {state.user.name}
            </span>
          </SettingsRow>
          <SettingsRow label="Email">
            <span className="text-sm text-gray-600" data-testid="account-email">
              {state.user.email}
            </span>
          </SettingsRow>
          <SettingsRow
            label={state.status === "expired" ? "Session expired" : "Signed in"}
            description={
              state.status === "expired"
                ? "Changes are kept on this device until you sign in again."
                : undefined
            }
          >
            {state.status === "expired" && (
              <Button size="sm" onPress={() => app.overlays.open("account.signIn")}>
                Sign in again
              </Button>
            )}
            <Button size="sm" variant="secondary" onPress={() => void api.signOut()}>
              Sign out
            </Button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Plan">
        <SettingsCard>
          <SettingsRow
            label="Lydie Cloud"
            description="Free for now, within fair use: it is for notes and documents, not for storing files in bulk."
          >
            <span className="text-sm text-gray-600">Free</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SecuritySections />
      {details && (
        <SettingsSection title="Sync">
          <SettingsCard>
            <SettingsCardBlock className="p-0">
              <SyncDetailsBody details={details} />
            </SettingsCardBlock>
          </SettingsCard>
        </SettingsSection>
      )}
      {api.scope.kind === "local" && api.handoff && (
        <SettingsSection
          title="This workspace"
          description="It lives on this device only. Put it in Lydie Cloud to reach it from other devices and share it."
        >
          <SettingsCard>
            <SettingsRow label={app.workspace.workspaceName}>
              <Button size="sm" onPress={() => app.overlays.open("account.handoff")}>
                {toCloud(api)}…
              </Button>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}
    </SettingsSections>
  );
}
