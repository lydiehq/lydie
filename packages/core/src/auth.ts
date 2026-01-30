import { db, schema } from "@lydie/database";
import { checkout, polar, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, customSession, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resource } from "sst";

import { sendEmail } from "./email";
import { createId } from "./id";
import { scheduleOnboardingEmails } from "./onboarding";
import { syncCreditBalanceFromPolar } from "./polar-credits";
import { onMemberAdded, onMemberRemoved } from "./seat-management";

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
      clientId: Resource.GoogleClientId.value,
      clientSecret: Resource.GoogleClientSecret.value,
    },
  },
  trustedOrigins:
    Resource.App.stage === "production"
      ? ["https://lydie.co", "https://api.lydie.co", "https://app.lydie.co"]
      : ["http://localhost:3001", "http://localhost:3000"],
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
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await sendEmail({
            to: "lars@salling.me",
            subject: "New user signed up to Lydie",
            html: `<p>New user signed up to Lydie: ${user.email}</p>`,
          });

          const fullName = user.name || user.email.split("@")[0] || "My";
          const firstName = fullName.split(" ")[0];

          await scheduleOnboardingEmails({
            userId: user.id,
            email: user.email,
            fullName: user.name || `${firstName}`,
          });

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
        },
      },
    },
    member: {
      create: {
        async after(member) {
          // Sync seat count with Polar when a member is added
          try {
            await onMemberAdded(member.organizationId);
          } catch (error) {
            console.error("Error handling member addition:", error);
          }
        },
      },
      delete: {
        async after(member) {
          // Sync seat count with Polar when a member is removed
          try {
            await onMemberRemoved(member.organizationId);
          } catch (error) {
            console.error("Error handling member removal:", error);
          }
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    organization({
      sendInvitationEmail: async (data) => {
        const frontendUrl =
          process.env.FRONTEND_URL ||
          (Resource.App.stage === "production" ? "https://app.lydie.co" : "http://localhost:3000");
        const invitationUrl = `${frontendUrl}/invitations/${data.invitation.id}`;

        await sendEmail({
          to: data.email,
          subject: `You've been invited to join ${data.organization.name}`,
          html: `
            <p>You've been invited to join <strong>${data.organization.name}</strong> on Lydie.</p>
            <p>Click the link below to accept the invitation:</p>
            <p><a href="${invitationUrl}">${invitationUrl}</a></p>
            <p>This invitation will expire in 48 hours.</p>
          `,
        });
      },
    }),
    customSession(async ({ user, session }) => {
      const members = await db
        .select({
          organizationId: schema.membersTable.organizationId,
          role: schema.membersTable.role,
          organization: schema.organizationsTable,
        })
        .from(schema.membersTable)
        .innerJoin(
          schema.organizationsTable,
          eq(schema.membersTable.organizationId, schema.organizationsTable.id),
        )
        .where(eq(schema.membersTable.userId, user.id));

      const organizations = members.map((m) => m.organization);

      const foundOrg = session.activeOrganizationId
        ? organizations.find((org) => org.id === session.activeOrganizationId)
        : undefined;
      const activeOrganizationSlug = foundOrg?.slug;

      // Extend the session object with organizations and user role so they're available directly on session
      return {
        user,
        session: {
          ...session,
          role: user.role,
          organizations,
          activeOrganizationSlug,
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
              productId: Resource.PolarProductSlugMonthly.value,
              slug: "monthly",
            },
            {
              productId: Resource.PolarProductSlugYearly.value,
              slug: "yearly",
            },
          ],
          successUrl: "/",
          authenticatedUsersOnly: true,
        }),
        portal(),
        usage(),
        webhooks({
          secret: Resource.PolarWebhookSecret?.value || "",
          onSubscriptionCreated: async (payload) => {
            console.log("Subscription created:", payload);
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata");
              return;
            }

            // Determine plan type from product
            const productId = payload.data.productId;
            let planType = "free";
            if (productId === Resource.PolarProductSlugMonthly.value) {
              planType = "monthly";
            } else if (productId === Resource.PolarProductSlugYearly.value) {
              planType = "yearly";
            }

            // Get quantity (number of seats)
            const quantity =
              payload.data.recurringInterval === "month" ||
              payload.data.recurringInterval === "year"
                ? payload.data.quantity || 1
                : 1;

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: payload.data.status,
                subscriptionPlan: planType,
                polarSubscriptionId: payload.data.id,
                paidSeats: planType !== "free" ? quantity : 0,
              })
              .where(eq(schema.organizationsTable.id, organizationId));

            // Sync credit balance from Polar
            try {
              await syncCreditBalanceFromPolar(organizationId);
            } catch (error) {
              console.error("Error syncing credit balance on subscription created:", error);
            }
          },
          onSubscriptionActive: async (payload) => {
            console.log("Subscription active:", payload);
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata");
              return;
            }

            // Determine plan type from product
            const productId = payload.data.productId;
            let planType = "free";
            if (productId === Resource.PolarProductSlugMonthly.value) {
              planType = "monthly";
            } else if (productId === Resource.PolarProductSlugYearly.value) {
              planType = "yearly";
            }

            // Get quantity (number of seats)
            const quantity =
              payload.data.recurringInterval === "month" ||
              payload.data.recurringInterval === "year"
                ? payload.data.quantity || 1
                : 1;

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: "active",
                subscriptionPlan: planType,
                polarSubscriptionId: payload.data.id,
                paidSeats: planType !== "free" ? quantity : 0,
              })
              .where(eq(schema.organizationsTable.id, organizationId));

            // Sync credit balance from Polar
            try {
              await syncCreditBalanceFromPolar(organizationId);
            } catch (error) {
              console.error("Error syncing credit balance on subscription active:", error);
            }
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
                paidSeats: 0,
              })
              .where(eq(schema.organizationsTable.id, organizationId));

            // Sync credit balance to reflect free tier credits
            try {
              await syncCreditBalanceFromPolar(organizationId);
            } catch (error) {
              console.error("Error syncing credit balance on subscription canceled:", error);
            }
          },
          onSubscriptionUpdated: async (payload) => {
            console.log("Subscription updated:", payload);
            const organizationId = payload.data.metadata?.referenceId;
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata");
              return;
            }

            // Determine plan type from product
            const productId = payload.data.productId;
            let planType = "free";
            if (productId === Resource.PolarProductSlugMonthly.value) {
              planType = "monthly";
            } else if (productId === Resource.PolarProductSlugYearly.value) {
              planType = "yearly";
            }

            // Get quantity (number of seats)
            const quantity =
              payload.data.recurringInterval === "month" ||
              payload.data.recurringInterval === "year"
                ? payload.data.quantity || 1
                : 1;

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: payload.data.status,
                subscriptionPlan: planType,
                paidSeats: planType !== "free" ? quantity : 0,
              })
              .where(eq(schema.organizationsTable.id, organizationId));

            // Sync credit balance from Polar
            try {
              await syncCreditBalanceFromPolar(organizationId);
            } catch (error) {
              console.error("Error syncing credit balance on subscription updated:", error);
            }
          },
          onBenefitGranted: async (payload) => {
            console.log("Benefit granted:", payload);

            // Credits benefit was granted, sync the balance
            const subscriptionId = payload.data.subscriptionId;
            if (!subscriptionId) {
              console.warn("No subscription ID in benefit granted event");
              return;
            }

            // Find the organization by subscription ID
            const org = await db
              .select()
              .from(schema.organizationsTable)
              .where(eq(schema.organizationsTable.polarSubscriptionId, subscriptionId))
              .limit(1);

            if (org[0]) {
              try {
                await syncCreditBalanceFromPolar(org[0].id);
              } catch (error) {
                console.error("Error syncing credit balance on benefit granted:", error);
              }
            }
          },
        }),
      ],
    }),
  ],
});
