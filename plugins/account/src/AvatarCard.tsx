import { useApp } from "@lydie/plugin-api";
import type { AccountApi, AccountUser } from "@lydie/plugin-api";
import { AvatarEditor, SettingsCard, SettingsCardBlock } from "@lydie/plugin-api/ui";

import { errorMessage } from "./format.ts";

// The signed-in person's picture, large, with a choice of the doodles or one of their own. It is
// saved to the account, so everyone in their workspaces sees it.
export function AvatarCard({ api, user }: { api: AccountApi; user: AccountUser }) {
  const app = useApp();
  return (
    <SettingsCard>
      <SettingsCardBlock data-testid="avatar-card">
        <AvatarEditor
          seed={user.id}
          image={user.image}
          shape="circle"
          title="Avatar"
          description="Shown next to your name in every workspace."
          onSave={async (image) => {
            try {
              await api.setImage(image);
              app.notify({ title: "Avatar saved" });
            } catch (error) {
              app.notify({
                title: "Could not save your avatar",
                description: errorMessage(error),
                kind: "error",
              });
              throw error;
            }
          }}
        />
      </SettingsCardBlock>
    </SettingsCard>
  );
}
