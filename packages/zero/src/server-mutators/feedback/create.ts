import { sendEmail } from "@lydie/core/email";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import type { MutatorContext } from "../../server-mutators";

import { hasOrganizationAccess } from "../../auth";
import { zql } from "../../schema";

export function createFeedbackMutation(context: MutatorContext) {
  return defineMutator(
    z.object({
      id: z.string(),
      type: z.enum(["feedback", "help"]).optional(),
      message: z.string().min(1),
      metadata: z.any().optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { id, type, message, metadata, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      const feedbackType = type || "feedback";

      // Insert into database
      await tx.mutate.feedback_submissions.insert({
        id,
        user_id: ctx.userId,
        organization_id: organizationId,
        type: feedbackType,
        message,
        metadata: metadata || null,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      // Get user and organization details for the email
      context.asyncTasks.push(async () => {
        const user = await tx.run(zql.users.where("id", ctx.userId).one());
        const organization = await tx.run(zql.organizations.where("id", organizationId).one());

        const metadataStr = metadata
          ? `\n\n**Context:**\n${JSON.stringify(metadata, null, 2)}`
          : "";

        await sendEmail({
          to: "lars@salling.me",
          from: "no-reply@lydie.co",
          subject: `New Feedback from ${user?.name || user?.email}`,
          html: `
            <h2>New Feedback Submission</h2>
            <p><strong>From:</strong> ${user?.name || "Unknown"} (${user?.email})</p>
            <p><strong>Organization:</strong> ${organization?.name || "Unknown"}</p>
            <h3>Message:</h3>
            <p>${message.replace(/\n/g, "<br>")}</p>
            ${metadataStr ? `<pre>${metadataStr}</pre>` : ""}
          `,
        });
      });
    },
  );
}
