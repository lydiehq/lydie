import { defineMutator } from "@rocicorp/zero"
import { z } from "zod"
import { mutators as sharedMutators } from "../../mutators/index"
import { db } from "@lydie/database"
import { processTemplateTitleEmbedding } from "@lydie/core/embedding/template-processing"
import { MutatorContext } from "../../server-mutators"
import { zql } from "../../schema"

export const createTemplateMutation = ({ asyncTasks }: MutatorContext) =>
  defineMutator(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      teaser: z.string().optional(),
      detailedDescription: z.string().optional(),
      categoryIds: z.array(z.string()).optional(),
      rootDocumentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      // Call the shared client mutator first
      await sharedMutators.template.create.fn({ tx, ctx, args })

      // Find the template that was just created by querying for the most recent template
      // with this name. Since we're in the same transaction, the template should be
      // the most recent one with this name.
      const templates = await tx.run(
        zql.templates.where("name", args.name).orderBy("created_at", "desc").limit(1),
      )

      const template = templates[0]
      if (!template) {
        throw new Error("Failed to find created template")
      }

      // Generate title embedding (only on server side, fire-and-forget)
      if (args.name.trim().length >= 3) {
        asyncTasks.push(async () => {
          await processTemplateTitleEmbedding(
            {
              templateId: template.id,
              title: args.name,
            },
            db,
          ).catch((error) => {
            console.error(`Failed to generate embedding for template ${template.id}:`, error)
            // Don't throw - embedding generation failure shouldn't fail template creation
          })
        })
      }
    },
  )
