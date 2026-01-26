import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import {
  db,
  documentEmbeddingsTable,
  documentTitleEmbeddingsTable,
  documentsTable,
} from "@lydie/database";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { mutators as sharedMutators } from "../../mutators/index";
import {
  createOnboardingContent,
  demoContent,
  ONBOARDING_GUIDE_ID,
} from "../../onboarding/onboarding-content";
import { MutatorContext } from "../../server-mutators";

export const createOrganizationMutation = ({}: MutatorContext) =>
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
      // Call the client mutator to create the organization (without onboarding docs)
      await sharedMutators.organization.create.fn({
        tx,
        ctx,
        args: {
          ...args,
          onboardingDocId: undefined, // Don't create onboarding docs in client mutator
        },
      });

      // If onboarding is requested, create onboarding documents with embeddings synchronously
      // This blocks creation to ensure the organization is fully seeded before redirect
      if (args.onboardingDocId) {
        await createOnboardingDocumentsWithEmbeddings(args.id, args.onboardingDocId, ctx.userId);
      }
    },
  );

async function createOnboardingDocumentsWithEmbeddings(
  organizationId: string,
  onboardingDocId: string,
  userId: string,
) {
  // Dynamically import the pre-computed embeddings
  const { onboardingEmbeddings } = await import("../../onboarding/embeddings");

  const documentIdMap = new Map<string, string>();
  for (const doc of demoContent) {
    documentIdMap.set(doc.id, createId());
  }
  documentIdMap.set(ONBOARDING_GUIDE_ID, onboardingDocId);

  const guideContent = createOnboardingContent();
  const guideYjsState = convertJsonToYjs(guideContent);
  const guideTitle = "👋 Welcome to Your Workspace!";

  const now = new Date();

  await db.insert(documentsTable).values({
    id: onboardingDocId,
    slug: `${slugify("Welcome to Your Workspace")}-${createId().slice(0, 6)}`,
    title: guideTitle,
    yjsState: guideYjsState,
    userId: userId,
    organizationId: organizationId,
    integrationLinkId: null,
    isLocked: false,
    published: false,
    parentId: null,
    sortOrder: 0,
    customFields: {
      Description:
        "These are custom fields that can be added to documents. They can be queried and filtered on via the REST API.",
      Priority: "High",
      Type: "Guide",
    },
    createdAt: now,
    updatedAt: now,
  });

  const guideEmbeddings = onboardingEmbeddings[ONBOARDING_GUIDE_ID];
  if (guideEmbeddings) {
    await db.insert(documentTitleEmbeddingsTable).values({
      id: createId(),
      documentId: onboardingDocId,
      title: guideTitle,
      embedding: guideEmbeddings.titleEmbedding,
      createdAt: now,
      updatedAt: now,
    });

    if (guideEmbeddings.contentEmbeddings.length > 0) {
      await db.insert(documentEmbeddingsTable).values(
        guideEmbeddings.contentEmbeddings.map((embedding) => ({
          id: createId(),
          documentId: onboardingDocId,
          content: embedding.content,
          embedding: embedding.embedding,
          chunkIndex: embedding.chunkIndex,
          heading: embedding.heading,
          headingLevel: embedding.headingLevel,
          headerBreadcrumb: embedding.headerBreadcrumb,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  for (let i = 0; i < demoContent.length; i++) {
    const doc = demoContent[i];
    if (!doc) continue;

    const docId = documentIdMap.get(doc.id)!;
    const yjsState = convertJsonToYjs(doc.content);

    await db.insert(documentsTable).values({
      id: docId,
      slug: `${slugify(doc.title)}-${createId().slice(0, 6)}`,
      title: doc.title,
      yjsState: yjsState,
      userId: userId,
      organizationId: organizationId,
      integrationLinkId: null,
      isLocked: false,
      published: false,
      parentId: onboardingDocId,
      sortOrder: i,
      customFields: { isOnboarding: "true" },
      createdAt: now,
      updatedAt: now,
    });

    const docEmbeddings = onboardingEmbeddings[doc.id];
    if (docEmbeddings) {
      await db.insert(documentTitleEmbeddingsTable).values({
        id: createId(),
        documentId: docId,
        title: doc.title,
        embedding: docEmbeddings.titleEmbedding,
        createdAt: now,
        updatedAt: now,
      });

      if (docEmbeddings.contentEmbeddings.length > 0) {
        await db.insert(documentEmbeddingsTable).values(
          docEmbeddings.contentEmbeddings.map((embedding) => ({
            id: createId(),
            documentId: docId,
            content: embedding.content,
            embedding: embedding.embedding,
            chunkIndex: embedding.chunkIndex,
            heading: embedding.heading,
            headingLevel: embedding.headingLevel,
            headerBreadcrumb: embedding.headerBreadcrumb,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    }
  }
}
