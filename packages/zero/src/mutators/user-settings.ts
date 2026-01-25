import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { isAuthenticated } from "../auth";
import { zql } from "../schema";
import { notFoundError } from "../utils/errors";
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps";

export const userSettingsMutators = {
  update: defineMutator(
    z.object({
      persistDocumentTreeExpansion: z.boolean().optional(),
    }),
    async ({ tx, ctx, args: { persistDocumentTreeExpansion } }) => {
      isAuthenticated(ctx);

      // Get or create the user's settings
      let settings = await tx.run(zql.user_settings.where("user_id", ctx.userId).one());

      if (!settings) {
        // Create settings if they don't exist
        const id = createId();
        await tx.mutate.user_settings.insert(
          withTimestamps({
            id,
            user_id: ctx.userId,
            persist_document_tree_expansion: true,
          }),
        );
        settings = await tx.run(zql.user_settings.where("id", id).one());
      }

      if (!settings) {
        throw notFoundError("User settings", ctx.userId);
      }

      const updates: any = {
        id: settings.id,
      };

      if (persistDocumentTreeExpansion !== undefined) {
        updates.persist_document_tree_expansion = persistDocumentTreeExpansion;
      }

      await tx.mutate.user_settings.update(withUpdatedTimestamp(updates));
    },
  ),
};
