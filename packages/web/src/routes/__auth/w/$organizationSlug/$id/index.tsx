import { Button } from "@lydie/ui/components/generic/Button";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { Editor } from "@/components/Editor";
import { useDocumentTabSync } from "@/components/layout/DocumentTabBar";
import { Surface } from "@/components/layout/Surface";
import { useOrganization } from "@/context/organization.context";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/__auth/w/$organizationSlug/$id/")({
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

    return { doc };
  },
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { organization } = useOrganization();
  const [doc, status] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId: id,
    }),
  );

  useDocumentTitle(doc?.title, { suffix: "" });
  useDocumentTabSync(doc?.id, doc?.title);

  if (!doc && status.type === "complete") {
    return (
      <div className="h-screen py-1 pr-1 flex flex-col pl-1">
        <Surface className="flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-y-2">
            <span className="text-sm font-medium text-gray-900">Document not found</span>
            <p className="text-sm text-gray-500">
              {" "}
              The document you are looking for does not exist.
            </p>
            <Button size="sm" href={`/w/${organization?.slug}`}>
              Go back
            </Button>
          </div>
        </Surface>
      </div>
    );
  }
  if (!doc) return null;

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface>
        <Editor doc={doc} organizationId={organization.id} organizationSlug={organization.slug} />
      </Surface>
    </div>
  );
}
