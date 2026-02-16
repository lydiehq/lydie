import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useParams } from "@tanstack/react-router";

import { VersionHistoryPage } from "@/components/version-history/VersionHistoryPage";
import { useOrganization } from "@/context/organization.context";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/__auth/w/$organizationSlug/$id/history")({
  component: RouteComponent,
  ssr: false,
  loader: async ({ context, params }) => {
    const { zero, organization } = context;
    const { id } = params;

    const doc = zero.run(
      queries.documents.byId({
        organizationId: organization.id,
        documentId: id,
      }),
    );

    const versions = zero.run(
      queries.documentVersions.byDocumentId({
        organizationId: organization.id,
        documentId: id,
      }),
    );

    return { doc, versions };
  },
});

function RouteComponent() {
  const { id } = useParams({ strict: false });
  const { organization } = useOrganization();

  const [doc, docStatus] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId: id || "",
    }),
  );

  const [versions] = useQuery(
    queries.documentVersions.byDocumentId({
      organizationId: organization.id,
      documentId: id || "",
    }),
  );

  useDocumentTitle(doc ? `${doc.title} - History` : "History", { suffix: "" });

  if (!doc && docStatus.type === "complete") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center justify-center gap-y-2">
          <span className="text-sm font-medium text-gray-900">Document not found</span>
          <p className="text-sm text-gray-500">The document you are looking for does not exist.</p>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <VersionHistoryPage
      doc={doc}
      versions={versions}
      organizationId={organization.id}
      organizationSlug={organization.slug}
    />
  );
}
