import { accountPlugin } from "@lydie/plugin-account";
import { backlinksPlugin } from "@lydie/plugin-backlinks";
import { changelogPlugin } from "@lydie/plugin-changelog";
import { databasesPlugin } from "@lydie/plugin-databases";
import { documentTreePlugin } from "@lydie/plugin-document-tree";
import { editorViewPlugin } from "@lydie/plugin-editor-view";
import { homePlugin } from "@lydie/plugin-home";
import { importMarkdownPlugin } from "@lydie/plugin-import-markdown";
import { importNotionPlugin } from "@lydie/plugin-import-notion";
import { linksPlugin } from "@lydie/plugin-links";
import { mdxComponentsPlugin } from "@lydie/plugin-mdx-components";
import { mentionsPlugin } from "@lydie/plugin-mentions";
import { mermaidPlugin } from "@lydie/plugin-mermaid";
import { outlinePlugin } from "@lydie/plugin-outline";
import { pageDecorPlugin } from "@lydie/plugin-page-decor";
import { propertiesPlugin } from "@lydie/plugin-properties";
import { quickCapturePlugin } from "@lydie/plugin-quick-capture";
import { quickSwitcherPlugin } from "@lydie/plugin-quick-switcher";
import { searchPlugin } from "@lydie/plugin-search";
import { slashMenuPlugin } from "@lydie/plugin-slash-menu";
import { threadsPlugin } from "@lydie/plugin-threads";
import { trashPlugin } from "@lydie/plugin-trash";
import { versionsPlugin } from "@lydie/plugin-versions";

import { lazyPlugin } from "./lazy-plugin.ts";

// Their own chunks: the settings window and the hosted team, sharing and publishing UIs.
const settingsPlugin = lazyPlugin(
  {
    id: "settings",
    name: "Settings",
    description: "The settings window and its general pages.",
    essential: true,
  },
  () => import("@lydie/plugin-settings").then((m) => m.settingsPlugin),
);
const teamPlugin = lazyPlugin(
  {
    id: "team",
    name: "Team",
    description: "Members and invitations of a cloud workspace, and its sections in the sidebar.",
  },
  () => import("@lydie/plugin-team").then((m) => m.teamPlugin),
);
const sharingPlugin = lazyPlugin(
  {
    id: "sharing",
    name: "Sharing",
    description: "Share pages with people and guests, and publish them to the web.",
  },
  () => import("@lydie/plugin-sharing").then((m) => m.sharingPlugin),
);
const publishingPlugin = lazyPlugin(
  {
    id: "publishing",
    name: "Publishing",
    description: "Publish documents to GitHub, WordPress and webhooks.",
  },
  () => import("@lydie/plugin-publishing").then((m) => m.publishingPlugin),
);

// Design explorations, linked from the bottom of the sidebar; never in a production build.
const devPlugins = import.meta.env.DEV
  ? [
      lazyPlugin(
        {
          id: "playground",
          name: "Playground",
          description: "Design explorations, in development builds only.",
        },
        () => import("./playground/playground-plugin.tsx").then((m) => m.playgroundPlugin),
      ),
    ]
  : [];

// The built-in feature set, in activation order.
export const plugins = [
  documentTreePlugin,
  editorViewPlugin,
  linksPlugin,
  propertiesPlugin,
  databasesPlugin,
  searchPlugin,
  quickSwitcherPlugin,
  homePlugin,
  trashPlugin,
  backlinksPlugin,
  slashMenuPlugin,
  outlinePlugin,
  threadsPlugin,
  mdxComponentsPlugin,
  mermaidPlugin,
  versionsPlugin,
  pageDecorPlugin,
  quickCapturePlugin,
  mentionsPlugin,
  settingsPlugin,
  importNotionPlugin,
  importMarkdownPlugin,
  accountPlugin,
  teamPlugin,
  sharingPlugin,
  publishingPlugin,
  changelogPlugin,
  ...devPlugins,
];
