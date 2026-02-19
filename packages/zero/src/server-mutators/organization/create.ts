import { setupOrganizationBilling } from "@lydie/core/billing/billing-sync";
import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { documentEmbeddingsTable, documentTitleEmbeddingsTable } from "@lydie/database";
import { defineMutator, Transaction } from "@rocicorp/zero";

import "../../db-types";
import { z } from "zod";

import { mutators as sharedMutators } from "../../mutators/index";
import { onboardingEmbeddings } from "../../onboarding/embeddings";
import {
  createOnboardingContent,
  demoContent,
  ONBOARDING_GUIDE_ID,
} from "../../onboarding/onboarding-content";
import { MutatorContext } from "../../server-mutators";
import { withTimestamps } from "../../utils/timestamps";

export const createOrganizationMutation = (context: MutatorContext) =>
  defineMutator(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      logo: z.string().optional(),
      metadata: z.string().optional(),
      color: z.string().optional(),
      onboardingDocId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      await sharedMutators.organization.create.fn({
        tx,
        ctx,
        args: {
          ...args,
          onboardingDocId: undefined, // Don't create onboarding docs in client mutator
        },
      });

      // We don't do this with asyncTasks on purpose so users are not redirected
      // and presented an empty organization before the onboarding documents are
      // created.

      if (args.onboardingDocId) {
        await createOnboardingDocumentsWithEmbeddings(
          tx,
          args.id,
          args.onboardingDocId,
          ctx.userId,
        );
      }

      // Setup billing for the organization after transaction commits
      // This creates free tier workspace billing and initial credits for the owner
      context.asyncTasks.push(async () => {
        try {
          await setupOrganizationBilling(
            args.id,
            args.name,
            ctx.userId,
            // Email and name will be fetched by setupOrganizationBilling
          );
        } catch (error) {
          console.error("Failed to setup billing for organization:", args.id, error);
          // Don't throw - billing setup failure shouldn't block organization creation
        }
      });
    },
  );

async function createOnboardingDocumentsWithEmbeddings(
  tx: Transaction,
  organizationId: string,
  onboardingDocId: string,
  userId: string,
) {
  // we need to narrow the type here, despite server mutators always being server-side
  if (tx.location !== "server") {
    throw new Error("This function can only be called on the server");
  }

  const drizzleDb = tx.dbTransaction.wrappedTransaction;

  const documentIdMap = new Map<string, string>();
  for (const doc of demoContent) {
    documentIdMap.set(doc.id, createId());
  }
  documentIdMap.set(ONBOARDING_GUIDE_ID, onboardingDocId);

  const guideContent = createOnboardingContent();
  const guideYjsState = convertJsonToYjs(guideContent);
  const guideTitle = "👋 Welcome to Your Workspace!";

  const now = Date.now();

  await tx.mutate.documents.insert(
    withTimestamps({
      id: onboardingDocId,
      slug: `${slugify("Welcome to Your Workspace")}-${createId().slice(0, 6)}`,
      title: guideTitle,
      yjs_state: guideYjsState,
      user_id: userId,
      organization_id: organizationId,
      integration_link_id: null,
      full_width: false,
      is_favorited: false,
      published: false,
      parent_id: null,
      sort_order: 0,
    }),
  );

  // Use Drizzle for embeddings (not in Zero's schema but in same transaction)
  const guideEmbeddings = onboardingEmbeddings[ONBOARDING_GUIDE_ID];
  if (guideEmbeddings) {
    await drizzleDb.insert(documentTitleEmbeddingsTable).values({
      id: createId(),
      documentId: onboardingDocId,
      title: guideTitle,
      embedding: guideEmbeddings.titleEmbedding,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });

    if (guideEmbeddings.contentEmbeddings.length > 0) {
      await drizzleDb.insert(documentEmbeddingsTable).values(
        guideEmbeddings.contentEmbeddings.map((embedding) => ({
          id: createId(),
          documentId: onboardingDocId,
          content: embedding.content,
          embedding: embedding.embedding,
          chunkIndex: embedding.chunkIndex,
          heading: embedding.heading,
          headingLevel: embedding.headingLevel,
          headerBreadcrumb: embedding.headerBreadcrumb,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })),
      );
    }
  }

  for (let i = 0; i < demoContent.length; i++) {
    const doc = demoContent[i];
    if (!doc) continue;

    const docId = documentIdMap.get(doc.id)!;
    const yjsState = convertJsonToYjs(doc.content);

    await tx.mutate.documents.insert(
      withTimestamps({
        id: docId,
        slug: `${slugify(doc.title)}-${createId().slice(0, 6)}`,
        title: doc.title,
        yjs_state: yjsState,
        user_id: userId,
        organization_id: organizationId,
        integration_link_id: null,
        is_favorited: false,
        full_width: false,
        published: false,
        parent_id: onboardingDocId,
        sort_order: i,
      }),
    );

    const docEmbeddings = onboardingEmbeddings[doc.id];
    if (docEmbeddings) {
      await drizzleDb.insert(documentTitleEmbeddingsTable).values({
        id: createId(),
        documentId: docId,
        title: doc.title,
        embedding: docEmbeddings.titleEmbedding,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });

      if (docEmbeddings.contentEmbeddings.length > 0) {
        await drizzleDb.insert(documentEmbeddingsTable).values(
          docEmbeddings.contentEmbeddings.map((embedding) => ({
            id: createId(),
            documentId: docId,
            content: embedding.content,
            embedding: embedding.embedding,
            chunkIndex: embedding.chunkIndex,
            heading: embedding.heading,
            headingLevel: embedding.headingLevel,
            headerBreadcrumb: embedding.headerBreadcrumb,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          })),
        );
      }
    }
  }
}
