import { defineMutator } from "@rocicorp/zero"
import { createId } from "@lydie/core/id"
import { z } from "zod"
import { isAuthenticated, hasOrganizationAccess } from "../auth"
import { zql } from "../schema"
import { notFoundError } from "../utils/errors"
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps"

export const agentMutators = {
  create: defineMutator(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      systemPrompt: z.string().min(1),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { name, description, systemPrompt, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId)
      isAuthenticated(ctx)

      // Check if organization is premium
      const organization = await tx.run(zql.organizations.where("id", organizationId).one())

      if (!organization) {
        throw notFoundError("Organization", organizationId)
      }

      if (organization.subscription_plan !== "pro" || organization.subscription_status !== "active") {
        throw new Error("Premium subscription required to create custom agents")
      }

      const id = createId()
      await tx.mutate.assistant_agents.insert(
        withTimestamps({
          id,
          name,
          description: description || null,
          system_prompt: systemPrompt,
          is_default: false,
          organization_id: organizationId,
          user_id: ctx.userId,
        }),
      )
    },
  ),

  update: defineMutator(
    z.object({
      agentId: z.string(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      systemPrompt: z.string().min(1).optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { agentId, name, description, systemPrompt, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId)
      isAuthenticated(ctx)

      // Get the agent and verify ownership
      const agent = await tx.run(zql.assistant_agents.where("id", agentId).one())

      if (!agent) {
        throw notFoundError("Agent", agentId)
      }

      if (agent.is_default) {
        throw new Error("Cannot modify default agents")
      }

      if (agent.user_id !== ctx.userId || agent.organization_id !== organizationId) {
        throw new Error("You don't have permission to modify this agent")
      }

      const updates: any = {
        id: agentId,
      }

      if (name !== undefined) {
        updates.name = name
      }

      if (description !== undefined) {
        updates.description = description || null
      }

      if (systemPrompt !== undefined) {
        updates.system_prompt = systemPrompt
      }

      await tx.mutate.assistant_agents.update(withUpdatedTimestamp(updates))
    },
  ),

  delete: defineMutator(
    z.object({
      agentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { agentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId)
      isAuthenticated(ctx)

      // Get the agent and verify ownership
      const agent = await tx.run(zql.assistant_agents.where("id", agentId).one())

      if (!agent) {
        throw notFoundError("Agent", agentId)
      }

      if (agent.is_default) {
        throw new Error("Cannot delete default agents")
      }

      if (agent.user_id !== ctx.userId || agent.organization_id !== organizationId) {
        throw new Error("You don't have permission to delete this agent")
      }

      await tx.mutate.assistant_agents.delete({
        id: agentId,
      })
    },
  ),
}
