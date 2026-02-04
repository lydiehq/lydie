import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { requireAdmin } from "../auth";
import { zql } from "../schema";

export const templateFaqMutators = {
  create: defineMutator(
    z.object({
      templateId: z.string(),
      question: z.string(),
      answer: z.string(),
      sortOrder: z.number().optional(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const template = await tx.run(zql.templates.where("id", args.templateId).one());

      if (!template) {
        throw new Error("Template not found");
      }

      // Get max sort order for this template
      const existingFaqs = await tx.run(zql.template_faqs.where("template_id", args.templateId));

      let maxSortOrder = -1;
      for (const faq of existingFaqs) {
        const sortOrder = (faq as { sort_order?: number }).sort_order ?? 0;
        if (sortOrder > maxSortOrder) {
          maxSortOrder = sortOrder;
        }
      }

      await tx.mutate.template_faqs.insert({
        id: createId(),
        template_id: args.templateId,
        question: args.question,
        answer: args.answer,
        sort_order: args.sortOrder ?? maxSortOrder + 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    },
  ),

  update: defineMutator(
    z.object({
      faqId: z.string(),
      question: z.string().optional(),
      answer: z.string().optional(),
      sortOrder: z.number().optional(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const faq = await tx.run(zql.template_faqs.where("id", args.faqId).one());

      if (!faq) {
        throw new Error("FAQ not found");
      }

      await tx.mutate.template_faqs.update({
        id: args.faqId,
        ...(args.question !== undefined && { question: args.question }),
        ...(args.answer !== undefined && { answer: args.answer }),
        ...(args.sortOrder !== undefined && { sort_order: args.sortOrder }),
        updated_at: Date.now(),
      });
    },
  ),

  delete: defineMutator(
    z.object({
      faqId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const faq = await tx.run(zql.template_faqs.where("id", args.faqId).one());

      if (!faq) {
        throw new Error("FAQ not found");
      }

      await tx.mutate.template_faqs.delete({
        id: args.faqId,
      });
    },
  ),

  reorder: defineMutator(
    z.object({
      templateId: z.string(),
      faqIds: z.array(z.string()),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const template = await tx.run(zql.templates.where("id", args.templateId).one());

      if (!template) {
        throw new Error("Template not found");
      }

      // Update sort order for each FAQ
      for (let i = 0; i < args.faqIds.length; i++) {
        const faqId = args.faqIds[i];
        if (!faqId) continue;

        await tx.mutate.template_faqs.update({
          id: faqId,
          sort_order: i,
          updated_at: Date.now(),
        });
      }
    },
  ),
};
