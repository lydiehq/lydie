import { Editor } from "@/components/Editor";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";

export const Route = createFileRoute("/_auth/w/$organizationId/$id/")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { zero } = context;
    zero.run(
      queries.documents.byId({
        organizationId: params.organizationId,
        documentId: params.id,
      })
    );
  },
  ssr: false,
});

function RouteComponent() {
  const { id, organizationId } = Route.useParams();
  const [doc, status] = useQuery(
    queries.documents.byId({ organizationId, documentId: id })
  );

  if (!doc && status.type === "complete")
    return <span>Document not found</span>;
  if (!doc) return null;

  return <Editor doc={doc} key={id} />;
}
