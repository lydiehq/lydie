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

      await db.insert(schema.waitlistTable).values({
        id: createId(),
        email,
        status: "pending",
      });

      try {
        await sendEmail({
          to: email,
          subject: "You're on the Lydie waitlist!",
          text: `Welcome to the waitlist!

I'm working incredibly hard on making Lydie the best possible writing environment, and I'm very excited to have you the waitlist for when the platform is ready (we're right around the corner!).


I'm running a small roadmap for the project at https://lydie.co/roadmap, and I'll be updating it regularly with the latest progress. Feel free to get in contact if you have any questions or feedback.

Best,
Lars Salling
`,
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
