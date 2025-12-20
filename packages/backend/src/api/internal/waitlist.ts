import { Hono } from "hono";
import { db, schema } from "@lydie/database";
import { eq } from "drizzle-orm";
import { createId } from "@lydie/core/id";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { sendEmail } from "@lydie/core/email";

const waitlistSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const WaitlistRoute = new Hono().post(
  "/",
  zValidator("json", waitlistSchema),
  async (c) => {
    try {
      const { email } = c.req.valid("json");

      // Check if email already exists in waitlist
      const existing = await db
        .select()
        .from(schema.waitlistTable)
        .where(eq(schema.waitlistTable.email, email))
        .limit(1);

      if (existing.length > 0) {
        return c.json(
          { message: "You're already on the waitlist!", alreadyExists: true },
          200
        );
      }

      // Add to waitlist
      await db.insert(schema.waitlistTable).values({
        id: createId(),
        email,
        status: "pending",
      });

      // Send confirmation email
      const userName = email.split("@")[0];
      try {
        await sendEmail({
          to: email,
          subject: "You're on the Lydie waitlist! 🎉",
          html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background-color: #ffffff; padding: 40px 20px; border-radius: 8px;">
                    <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Welcome to the waitlist, ${userName}!</h1>
                    <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
                      Thank you for joining the Lydie waitlist. We're excited to have you on board!
                    </p>
                    <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
                      We're working hard to make Lydie the best writing environment possible. You'll be among the first to know when we're ready to welcome you.
                    </p>
                    <p style="color: #666; font-size: 16px; margin-bottom: 30px;">
                      In the meantime, feel free to check out our <a href="https://lydie.co/blog" style="color: #2563eb; text-decoration: none;">blog</a> and <a href="https://lydie.co/roadmap" style="color: #2563eb; text-decoration: none;">roadmap</a> to see what we're building.
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                      Best regards,<br>
                      The Lydie Team
                    </p>
                  </div>
                </body>
              </html>
            `,
          text: `Welcome to the waitlist, ${userName}!

Thank you for joining the Lydie waitlist. We're excited to have you on board!

We're working hard to make Lydie the best writing environment possible. You'll be among the first to know when we're ready to welcome you.

In the meantime, feel free to check out our blog (https://lydie.co/blog) and roadmap (https://lydie.co/roadmap) to see what we're building.

Best regards,
The Lydie Team`,
        });
      } catch (emailError) {
        // Log email error but don't fail the request
        console.error(
          "Failed to send waitlist confirmation email:",
          emailError
        );
      }

      return c.json({ message: "Successfully added to waitlist!" }, 201);
    } catch (error) {
      console.error("Waitlist signup error:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: "Failed to add to waitlist",
      });
    }
  }
);
