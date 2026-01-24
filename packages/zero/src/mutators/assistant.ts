import { defineMutator } from "@rocicorp/zero"
import { z } from "zod"
import { isAuthenticated } from "../auth"
import { zql } from "../schema"
import { unauthorizedError } from "../utils/errors"

export const assistantMutators = {
  delete: defineMutator(
    z.object({
      conversationId: z.string(),
    }),
    async ({ tx, ctx, args: { conversationId } }) => {
      isAuthenticated(ctx)

      const conversation = await tx.run(zql.assistant_conversations.where("id", conversationId).one())

      if (!conversation) return

      if (conversation.user_id !== ctx.userId) {
        throw unauthorizedError()
      }

      await tx.mutate.assistant_conversations.delete({
        id: conversationId,
      })

      const messages = await tx.run(zql.assistant_messages.where("conversation_id", conversationId))

      for (const message of messages) {
        await tx.mutate.assistant_messages.delete({ id: message.id })
      }
    },
  ),
}
