import { definePlugin } from "@lydie/plugin-api";

import { LazyPropertiesPanel, preloadPropertiesPanel } from "./lazy.tsx";

export const propertiesPlugin = definePlugin({
  id: "properties",
  name: "Properties",
  description: "Typed properties under every page's title, shared by the pages of a collection.",
  activate(ctx) {
    ctx.documents.register({ id: "properties", slot: "header", component: LazyPropertiesPanel });
    preloadPropertiesPanel();
  },
});

export default propertiesPlugin;
