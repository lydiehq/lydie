import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db, schema } from "@lydie/database"
import { Resource } from "sst"
import { organization, customSession, admin } from "better-auth/plugins"
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth"
import { Polar } from "@polar-sh/sdk"
import { eq } from "drizzle-orm"
import { createId } from "./id"
import { createOrganization } from "./organization"
import { slugify } from "./utils"
import { sendEmail } from "./email"
import { scheduleOnboardingEmails } from "./onboarding"

const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
})

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
  trustedOrigins: [
    ...(Resource.App.stage === "production"
      ? ["https://lydie.co", "https://api.lydie.co", "https://app.lydie.co"]
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
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await sendEmail({
            to: "lars@salling.me",
            subject: "New user signed up to Lydie",
            html: `<p>New user signed up to Lydie: ${user.email}</p>`,
          })

          const fullName = user.name || user.email.split("@")[0] || "My"
          const firstName = fullName.split(" ")[0]

          await scheduleOnboardingEmails({
            userId: user.id,
            email: user.email,
            fullName: user.name || `${firstName}`,
          })

          const existingSettings = await db
            .select()
            .from(schema.userSettingsTable)
            .where(eq(schema.userSettingsTable.userId, user.id))
            .limit(1)

          if (existingSettings.length === 0) {
            await db.insert(schema.userSettingsTable).values({
              id: createId(),
              userId: user.id,
              persistDocumentTreeExpansion: true,
            })
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
          (Resource.App.stage === "production" ? "https://app.lydie.co" : "http://localhost:3000")
        const invitationUrl = `${frontendUrl}/invitations/${data.invitation.id}`

        await sendEmail({
          to: data.email,
          subject: `You've been invited to join ${data.organization.name}`,
          html: `
            <p>You've been invited to join <strong>${data.organization.name}</strong> on Lydie.</p>
            <p>Click the link below to accept the invitation:</p>
            <p><a href="${invitationUrl}">${invitationUrl}</a></p>
            <p>This invitation will expire in 48 hours.</p>
          `,
        })
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
        .where(eq(schema.membersTable.userId, user.id))

      const organizations = members.map((m) => m.organization)

      const foundOrg = session.activeOrganizationId
        ? organizations.find((org) => org.id === session.activeOrganizationId)
        : undefined
      const activeOrganizationSlug = foundOrg?.slug

      // Extend the session object with organizations and user role so they're available directly on session
      return {
        user,
        session: {
          ...session,
          role: user.role,
          organizations,
          activeOrganizationSlug,
        },
      }
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
            console.log("Subscription active:", payload)
            const organizationId = payload.data.metadata?.referenceId
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata")
              return
            }

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: "active",
                subscriptionPlan: "pro",
                polarSubscriptionId: payload.data.id,
              })
              .where(eq(schema.organizationsTable.id, organizationId))
          },
          onSubscriptionCanceled: async (payload) => {
            console.log("Subscription canceled:", payload)
            const organizationId = payload.data.metadata?.referenceId
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata")
              return
            }

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: "canceled",
                subscriptionPlan: "free",
              })
              .where(eq(schema.organizationsTable.id, organizationId))
          },
          onSubscriptionUpdated: async (payload) => {
            console.log("Subscription updated:", payload)
            const organizationId = payload.data.metadata?.referenceId
            if (!organizationId || typeof organizationId !== "string") {
              console.warn("No valid organization ID in subscription metadata")
              return
            }

            await db
              .update(schema.organizationsTable)
              .set({
                subscriptionStatus: payload.data.status,
              })
              .where(eq(schema.organizationsTable.id, organizationId))
          },
        }),
      ],
    }),
  ],
})
