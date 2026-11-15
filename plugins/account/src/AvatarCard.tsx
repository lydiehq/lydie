import { useApp } from "@lydie/plugin-api";
import type { AccountApi, AccountUser, HostedInput } from "@lydie/plugin-api";
import { AvatarEditor, SettingsCard, SettingsCardBlock } from "@lydie/plugin-api/ui";

import { errorMessage } from "./format.ts";

// The signed-in person's picture, large, with a choice of the doodles or one of their own. It is
// saved to the account, so everyone in their workspaces sees it. A drawing can also be shared on
// the Lydie site's doodle wall, where it shows once approved; the link shows it to them at once.
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
          share={{
            label: "Also share it on lydie.co/doodles",
            onShare: async (drawing) => {
              try {
                // The editor's pens are the ones the server takes.
                const pen = drawing.pen as HostedInput<"doodle.share">["pen"];
                const { url } = await api.call("doodle.share", { ...drawing, pen });
                app.notify({
                  title: "Doodle shared",
                  description: "Others see it on lydie.co/doodles once it has been approved.",
                  action: {
                    label: "Open",
                    onPress: () => window.open(url, "_blank", "noopener,noreferrer"),
                  },
                  duration: 10_000,
                });
              } catch (error) {
                app.notify({
                  title: "Could not share your doodle",
                  description: errorMessage(error),
                  kind: "error",
                });
                throw error;
              }
            },
          }}
        />
      </SettingsCardBlock>
    </SettingsCard>
  );
}
