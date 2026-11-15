import { z } from "zod";

import { defineQuery } from "../define.ts";
import { Timestamp, WorkspaceId } from "../entities.ts";

export const WorkspaceExport = z
  .object({
    url: z
      .string()
      .nullable()
      .describe(
        "Where to download the zip: a short-lived signed link on the hosted API, a local file or " +
          "blob URL in the apps, the file it was saved to on the desktop. null when the person " +
          "cancelled saving.",
      ),
    filename: z.string().describe('Suggested file name, e.g. "Notes 2026-11-15.zip".'),
    expiresAt: Timestamp.nullable().describe("When `url` stops working; null if it does not."),
  })
  .meta({ id: "WorkspaceExport" });
export type WorkspaceExport = z.infer<typeof WorkspaceExport>;

export const workspaceExport = defineQuery({
  id: "workspace.export",
  summary: "Export the workspace",
  description:
    "Exports every page, database and attachment you can read as a zip of the folder format: " +
    "Markdown files with frontmatter, a `.base` file per database, attachments and `.lydie/`. " +
    "Unzipped, it opens as a vault in Lydie's local mode and in Obsidian. The trash is left out. " +
    "Returns a link to download the zip.",
  input: z.object({ workspaceId: WorkspaceId }),
  output: WorkspaceExport,
  scopes: ["docs:read"],
  rest: { method: "POST", path: "/workspaces/{workspaceId}/export" },
  mcp: { name: "export_workspace", title: "Export workspace", outputSchema: true },
  cli: { command: ["workspace", "export"], args: ["workspaceId"] },
});
