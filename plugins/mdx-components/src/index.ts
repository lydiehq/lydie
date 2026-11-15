import { definePlugin } from "@lydie/plugin-api";

import { MdxComponents } from "./view.ts";

export const mdxComponentsPlugin = definePlugin({
  id: "mdx-components",
  name: "MDX components (experimental)",
  description:
    "Shows the components of an MDX file as what they are: a titled frame around a component's blocks, a card with its picture for one that stands alone, and the file's imports folded away. The file itself is not changed.",
  activate(ctx) {
    return ctx.editor.register({ extensions: () => [MdxComponents] });
  },
});

export default mdxComponentsPlugin;
