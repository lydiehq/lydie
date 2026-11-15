// workspace.export in the browser: the zip becomes a blob URL the settings page downloads.
import type { Exports } from "@lydie/runtime";

export function browserExports(workspaceName: () => string): Exports {
  return {
    workspaceName,
    async save({ data }) {
      const zip = await new Response(data).blob();
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      return { url, expiresAt: null };
    },
  };
}
