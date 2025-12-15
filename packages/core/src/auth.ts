import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@lydie/database";
import { Resource } from "sst";
import { organization, customSession, admin } from "better-auth/plugins";
import {
  polar,
  checkout,
  portal,
  usage,
  webhooks,
} from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";
import { createId } from "./id";
import { createOrganization } from "./organization";
import { slugify } from "./utils";
import { sendEmail } from "./email";

const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
});

export const authClient = betterAuth({
  logger: {
    level: "debug",
  },
  rateLimit: {
    enabled: false,
  },
  session: {
    cookieCache: {
      enabled: true,
    },
  },
  baseURL:
    Resource.App.stage === "production"
      ? "https://api.lydie.co/internal/public/auth"
      : "http://localhost:3001/internal/public/auth",
  secret: Resource.BetterAuthSecret.value,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.usersTable,
      verification: schema.verificationsTable,
      session: schema.sessionsTable,
      account: schema.accountsTable,
      organization: schema.organizationsTable,
      member: schema.membersTable,
      invitation: schema.invitationsTable,
    },
  }),
  socialProviders: {
    google: {
      disableSignUp: false,
      clientId: Resource.GoogleClientId.value,
      clientSecret: Resource.GoogleClientSecret.value,
    },
  },
  trustedOrigins: [
    ...(Resource.App.stage === "production"
      ? ["https://lydie.co", "https://api.lydie.co", "https://cloud.lydie.co"]
      : ["http://localhost:3001", "http://localhost:3000"]),
  ],
  advanced: {
    defaultCookieAttributes: {
      ...(Resource.App.stage === "production"
        ? {}
        : {
            sameSite: "none",
          }),
      partitioned: true,
      secure: Resource.App.stage !== "production",
    },
    crossSubDomainCookies: {
      enabled: true,
      domain: Resource.App.stage === "production" ? ".lydie.co" : ".localhost",
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      adminUserIds: [], // Add specific user IDs here if needed
    }),
    organization(),
    // Auto-create organization plugin - runs during user creation
    {
      id: "auto-create-organization",
      init() {
        return {
          options: {
            databaseHooks: {
              user: {
                create: {
                  async after(user) {
                    try {
                      // Check if user already has an organization
                      const existingMemberships = await db
                        .select()
                        .from(schema.membersTable)
                        .where(eq(schema.membersTable.userId, user.id))
                        .limit(1);

                      // Only create a workspace if the user doesn't have one yet
                      if (existingMemberships.length === 0) {
                        await sendEmail({
                          to: "lars@salling.me",
                          subject: "New user signed up to Lydie",
                          html: `<p>New user signed up to Lydie: ${user.email}</p>`,
                        });

                        // Extract first name from user's full name
                        const fullName =
                          user.name || user.email.split("@")[0] || "My";
                        const firstName = fullName.split(" ")[0];
                        const organizationName = `${firstName}'s Organization`;
                        const baseSlug = slugify(organizationName);
                        // Make slug unique by appending random characters
                        const slug = `${baseSlug}-${createId().slice(0, 6)}`;

                        // Create organization with all required setup (organization, member, settings)
                        await createOrganization({
                          name: organizationName,
                          slug: slug,
                          userId: user.id,
                        });
                      }
                    } catch (error) {
                      // Log error but don't break user creation
                      console.error(
                        "Failed to create organization for user:",
                        error
                      );
                    }

                    // Create default user settings if they don't exist
                    try {
                      const existingSettings = await db
                        .select()
                        .from(schema.userSettingsTable)
                        .where(eq(schema.userSettingsTable.userId, user.id))
                        .limit(1);

                      if (existingSettings.length === 0) {
                        await db.insert(schema.userSettingsTable).values({
                          id: createId(),
                          userId: user.id,
                          persistDocumentTreeExpansion: true,
                        });
                      }
                    } catch (error) {
                      // Log error but don't break user creation
                      // User settings can be created later if needed
                      console.error("Failed to create user settings:", error);
                    }
                  },
                },
              },
            },
          },
        };
      },
    },
    customSession(async ({ user, session }) => {
      // Fetch user's organizations with their memberships
      const members = await db
        .select({
          organizationId: schema.membersTable.organizationId,
          role: schema.membersTable.role,
          organization: schema.organizationsTable,
        })
        .from(schema.membersTable)
        .innerJoin(
          schema.organizationsTable,
          eq(schema.membersTable.organizationId, schema.organizationsTable.id)
        )
        .where(eq(schema.membersTable.userId, user.id));

      const organizations = members.map((m) => m.organization);

      // Extend the session object with organizations so they're available directly on session
      return {
        user,
        session: {
          ...session,
          organizations,
        },
      };
    }),
    polar({
      client: polarClient,
      createCustomerOnSignUp: false,
      use: [
        checkout({
          products: [
            {
              productId: Resource.PolarProProductId.value,
              slug: "pro",
            },
          ],
          successUrl: "/",
          authenticatedUsersOnly: true,
        }),
        portal(),
        usage(),
        webhooks({
          secret: Resource.PolarWebhookSecret?.value || "",
          onSubscriptionActive: async (payload) => {
            console.log("Subscription active:", payload);
            // Extract organization ID from checkout metadata (referenceId)
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata");
              return;
            }

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: "active",
                subscriptionPlan: "pro",
                polarSubscriptionId: payload.data.id,
              })
              .where(eq(schema.organizationsTable.id, organizationId));
          },
          onSubscriptionCanceled: async (payload) => {
            console.log("Subscription canceled:", payload);
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata");
              return;
            }

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: "canceled",
                subscriptionPlan: "free",
              })
              .where(eq(schema.organizationsTable.id, organizationId));
          },
          onSubscriptionUpdated: async (payload) => {
            console.log("Subscription updated:", payload);
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata");
              return;
            }

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: payload.data.status,
              })
              .where(eq(schema.organizationsTable.id, organizationId));
          },
        }),
      ],
    }),
  ],
});
