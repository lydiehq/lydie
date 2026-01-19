import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { hasOrganizationAccess } from "../../auth";
import { sendEmail } from "@lydie/core/email";
import { zql } from "../../schema";
import type { MutatorContext } from "../../server-mutators";

export function createFeedbackMutation(context: MutatorContext) {
    return defineMutator(
        z.object({
            id: z.string(),
            type: z.enum(["feedback", "help"]),
            message: z.string().min(1),
            metadata: z.any().optional(),
            organizationId: z.string(),
        }),
        async ({ tx, ctx, args: { id, type, message, metadata, organizationId } }) => {
            hasOrganizationAccess(ctx, organizationId);

            // Insert into database
            await tx.mutate.feedback_submissions.insert({
                id,
                user_id: ctx.userId,
                organization_id: organizationId,
                type,
                message,
                metadata: metadata || null,
                created_at: Date.now(),
                updated_at: Date.now(),
            });

            // Get user and organization details for the email
            context.asyncTasks.push(async () => {
                const user = await tx.run(zql.users.where("id", ctx.userId).one());
                const organization = await tx.run(
                    zql.organizations.where("id", organizationId).one()
                );

                const typeLabel = type === "feedback" ? "Feedback" : "Help Request";
                const metadataStr = metadata
                    ? `\n\n**Context:**\n${JSON.stringify(metadata, null, 2)}`
                    : "";

                await sendEmail({
                    to: "lars@salling.me",
                    from: "no-reply@lydie.co",
                    subject: `New ${typeLabel} from ${user?.name || user?.email}`,
                    html: `
            <h2>New ${typeLabel} Submission</h2>
            <p><strong>From:</strong> ${user?.name || "Unknown"} (${user?.email})</p>
            <p><strong>Organization:</strong> ${organization?.name || "Unknown"}</p>
            <p><strong>Type:</strong> ${typeLabel}</p>
            <h3>Message:</h3>
            <p>${message.replace(/\n/g, "<br>")}</p>
            ${metadataStr ? `<pre>${metadataStr}</pre>` : ""}
          `,
                });
            });
        }
    );
}
