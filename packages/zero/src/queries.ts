import { defineQueries, defineQuery, createBuilder } from "@rocicorp/zero";
import { z } from "zod";
import { schema } from "./schema";
import {
  isAuthenticated,
  hasOrganizationAccess,
  type Context,
} from "./auth";

export type QueryContext = Context;

export const builder = createBuilder(schema);

export const queries = defineQueries({
  documents: {
    byUpdated: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.documents
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .orderBy("updated_at", "desc");
      }
    ),
    byId: defineQuery(
      z.object({ organizationId: z.string(), documentId: z.string() }),
      ({ args: { organizationId, documentId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        return builder.documents
          .where("id", documentId)
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .one()
          .related("folder")
          .related("organization")
          .related("conversations", (q) =>
            q
              .related("messages", (q) => q.orderBy("created_at", "asc"))
              .orderBy("created_at", "desc")
              .limit(8)
          );
      }
    ),
    search: defineQuery(
      z.object({
        organizationId: z.string(),
        searchTerm: z.string(),
      }),
      ({ args: { organizationId, searchTerm }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        if (!searchTerm.trim()) {
          return builder.documents
            .where("organization_id", organizationId)
            .where("deleted_at", "IS", null)
            .orderBy("created_at", "desc")
            .limit(5);
        }

        return builder.documents
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .where("title", "ILIKE", `%${searchTerm}%`)
          .orderBy("created_at", "desc")
          .limit(20);
      }
    ),
  },
  components: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.document_components
          .where("organization_id", organizationId)
          .orderBy("created_at", "desc");
      }
    ),
  },
  apiKeys: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.api_keys
          .where("organization_id", organizationId)
          .where("revoked", false)
          .orderBy("created_at", "desc");
      }
    ),
  },
  members: {
    byOrganization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.members
          .where("organization_id", organizationId)
          .related("user")
          .orderBy("created_at", "desc");
      }
    ),
  },
  organizations: {
    byUser: defineQuery(
      z.object({}),
      ({ ctx }) => {
        isAuthenticated(ctx);
        return builder.members
          .where("user_id", ctx.userId)
          .related("organization")
          .orderBy("created_at", "desc");
      }
    ),
    byId: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.organizations.where("id", organizationId).one();
      }
    ),
    billing: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        return builder.organizations
          .where("id", organizationId)
          .one()
          .related("llmUsage", (q) => q.orderBy("created_at", "desc"));
      }
    ),
    documentsAndFolders: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        // Get all documents and folders, we'll filter by folder on the client
        // Exclude deleted items
        return builder.organizations
          .where("id", organizationId)
          .one()
          .related("documents", (q) =>
            q.where("deleted_at", "IS", null).orderBy("created_at", "desc")
          )
          .related("folders", (q) =>
            q.where("deleted_at", "IS", null).orderBy("created_at", "desc")
          );
      }
    ),
    searchDocumentsAndFolders: defineQuery(
      z.object({
        organizationId: z.string(),
        searchTerm: z.string(),
      }),
      ({ args: { organizationId, searchTerm }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        const searchPattern = searchTerm.trim() ? `%${searchTerm.trim()}%` : "%";

        // If search term is empty, return all items (limited)
        // Exclude deleted items
        if (!searchTerm.trim()) {
          return builder.organizations
            .where("id", organizationId)
            .one()
            .related("documents", (q) =>
              q
                .where("deleted_at", "IS", null)
                .orderBy("created_at", "desc")
                .limit(20)
            )
            .related("folders", (q) =>
              q
                .where("deleted_at", "IS", null)
                .orderBy("created_at", "desc")
                .limit(20)
            );
        }

        // Search documents by title and folders by name
        // Exclude deleted items
        return builder.organizations
          .where("id", organizationId)
          .one()
          .related("documents", (q) =>
            q
              .where("deleted_at", "IS", null)
              .where("title", "ILIKE", searchPattern)
              .orderBy("updated_at", "desc")
              .limit(20)
          )
          .related("folders", (q) =>
            q
              .where("deleted_at", "IS", null)
              .where("name", "ILIKE", searchPattern)
              .orderBy("updated_at", "desc")
              .limit(20)
          );
      }
    ),
  },
  assistant: {
    conversations: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.assistant_conversations
          .where("organization_id", organizationId)
          .where("user_id", ctx.userId)
          .related("messages", (q) => q.orderBy("created_at", "asc"))
          .orderBy("created_at", "desc");
      }
    ),
  },
  usage: {
    today: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);

        // Get start of today in Unix timestamp (milliseconds)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfDay = today.getTime();

        return builder.llm_usage
          .where("organization_id", organizationId)
          .where("created_at", ">=", startOfDay)
          .orderBy("created_at", "desc");
      }
    ),
  },
  settings: {
    user: defineQuery(
      z.object({}),
      ({ ctx }) => {
        isAuthenticated(ctx);
        const settings = builder.user_settings.where("user_id", ctx.userId).one();
        return settings;
      }
    ),
    organization: defineQuery(
      z.object({ organizationId: z.string() }),
      ({ args: { organizationId }, ctx }) => {
        hasOrganizationAccess(ctx, organizationId);
        return builder.organization_settings
          .where("organization_id", organizationId)
          .one();
      }
    ),
  },
});
