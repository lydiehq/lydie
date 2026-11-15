import type { Operations } from "@lydie/contract";

import { exportFilename, exportWorkspace, zipStream } from "../export.ts";
import type { Handlers } from "../runtime.ts";
import { unsupported } from "./doc.ts";

export const workspaceHandlers: Handlers<Operations> = {
  async "workspace.export"(ctx, input) {
    const exports = ctx.exports ?? unsupported("Exporting a workspace");
    const filename = exportFilename(
      exports.workspaceName?.(input.workspaceId) ?? "Lydie",
      new Date(),
    );
    const progress = ctx.progress;
    const data = zipStream(
      exportWorkspace(
        { read: (fn) => fn(ctx.tx), blob: ctx.blob },
        input.workspaceId,
        progress ? { onEntry: (done, total) => progress({ done, total }) } : {},
      ),
    );
    const saved = await exports.save({ workspaceId: input.workspaceId, filename, data });
    return { url: saved.url, filename, expiresAt: saved.expiresAt };
  },
};
