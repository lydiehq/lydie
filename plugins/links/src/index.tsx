import { definePlugin } from "@lydie/plugin-api";

import { EmbedBlock } from "./Embed.tsx";
import { LinkInteractions } from "./extension.ts";
import { LinkLayer } from "./LinkLayer.tsx";
import { ReadPreview } from "./ReadPreview.tsx";

export const linksPlugin = definePlugin({
  id: "links",
  name: "Links",
  description:
    "Link popover (hover preview, follow, edit, unlink, convert), unresolved links and embeds.",
  // A folder's link format for links it writes (`linkStyleOf`).
  permissions: ["vault"],
  activate(ctx) {
    ctx.editor.register({ extensions: () => [LinkInteractions], overlay: LinkLayer });
    ctx.links.register({
      id: "embed",
      kind: "embed",
      order: 100,
      match: () => true,
      component: EmbedBlock,
    });
    ctx.links.register({
      id: "preview",
      kind: "preview",
      order: 100,
      match: () => true,
      component: ReadPreview,
    });
  },
});

export default linksPlugin;
