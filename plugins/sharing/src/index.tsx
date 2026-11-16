import { definePlugin, docIdOf, useAccount, useApp, useQuery } from "@lydie/plugin-api";
import type { DocumentSlotProps } from "@lydie/plugin-api";
import { Button, GlobeRegular, Share2Regular } from "@lydie/plugin-api/ui";

import { LEVELS } from "./errors.ts";
import { ShareDialog } from "./ShareDialog.tsx";
import type { ShareProps } from "./ShareDialog.tsx";

export type { ShareProps } from "./ShareDialog.tsx";

// What the globe beside Share says: the page's own link, or the page above whose link reaches it.
function publicLabel(publicAccess: { documentId: string; sourceId: string; sourceTitle: string }) {
  return publicAccess.sourceId === publicAccess.documentId
    ? "Published to web"
    : `Published to web with ${publicAccess.sourceTitle || "Untitled"}`;
}

// Share at the top right of the page, before its ••• (hosted windows), with the user's own access
// beside it when they cannot edit, and a globe while the page is on the web.
function ShareButton({ docId }: DocumentSlotProps) {
  const app = useApp();
  const { api } = useAccount();
  const hosted = api?.scope.kind === "hosted";
  const doc = useQuery("doc.get", hosted ? { id: docId } : null).data[0];
  const access = useQuery("doc.access", hosted ? { id: docId } : null).data[0];
  const publicAccess = useQuery("doc.publicAccess", hosted ? { id: docId } : null).data[0];
  if (!hosted) return null;
  const level = access?.level ?? null;
  const share = () =>
    app.overlays.open("sharing.share", {
      documentId: docId,
      title: doc?.document.title ?? "",
    } satisfies ShareProps);
  return (
    <div className="flex items-center gap-1" data-testid="share-bar">
      {level && level !== "full" && level !== "edit" && (
        <span className="px-1 text-xs text-gray-400">{LEVELS[level].label}</span>
      )}
      {publicAccess && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={publicLabel(publicAccess)}
          className="text-blue-600 hover:text-blue-700"
          data-testid="public-indicator"
          onPress={share}
        >
          <GlobeRegular />
        </Button>
      )}
      <Button
        size="xs"
        variant="ghost"
        className="text-gray-600 hover:text-gray-900"
        onPress={share}
      >
        Share
      </Button>
    </div>
  );
}

export const sharingPlugin = definePlugin({
  id: "sharing",
  name: "Sharing",
  description: "Share pages with people and guests, and publish them to the web.",
  permissions: ["account"],
  activate(ctx) {
    const { app } = ctx;
    const hosted = () => app.services?.account?.scope.kind === "hosted";
    ctx.overlays.register({ id: "sharing.share", component: ShareDialog });
    ctx.documents.register({ id: "share", slot: "actions", component: ShareButton });
    ctx.documentMenu.register({
      id: "sharing.share",
      label: "Share…",
      icon: <Share2Regular />,
      group: "share",
      order: 10,
      when: () => hosted(),
      run: (doc) => app.overlays.open("sharing.share", { documentId: doc.id, title: doc.title }),
    });
    ctx.commands.register({
      id: "sharing.share",
      title: "Share this page",
      group: "Document",
      scope: "document",
      icon: <Share2Regular />,
      when: () => hosted() && docIdOf(app.activeTab()?.path) !== null,
      async run() {
        const docId = docIdOf(app.activeTab()?.path);
        if (!docId) return;
        const [doc] = await app.backend.query("doc.get", { id: docId });
        app.overlays.open("sharing.share", {
          documentId: docId,
          title: doc?.document.title ?? "",
        } satisfies ShareProps);
      },
    });
  },
});

export default sharingPlugin;
