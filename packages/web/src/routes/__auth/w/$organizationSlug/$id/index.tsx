import { Editor } from "@/components/Editor";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/$id/")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { zero } = context;
    const { organizationSlug } = params;
    // Get organization by slug first to get the ID
    const org = await zero.run(
      queries.organizations.bySlug({ organizationSlug })
    );
    if (org) {
      zero.run(
        queries.documents.byId({
          organizationId: org.id,
          documentId: params.id,
        })
      );
    }
  },
  ssr: false,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { organization } = useOrganization();
  const [doc, status] = useQuery(
    queries.documents.byId({
      organizationId: organization?.id || "",
      documentId: id,
    })
  );

  if (!doc && status.type === "complete")
    return <span>Document not found</span>;
  if (!doc) return null;

  return <Editor doc={doc} key={id} />;
}
