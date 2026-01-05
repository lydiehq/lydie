import { Editor } from "@/components/Editor";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";
import { useOrganization } from "@/context/organization.context";
import { Surface } from "@/components/layout/Surface";
import { Button } from "@/components/generic/Button";

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
      organizationId: organization.id,
      documentId: id,
    })
  );

  if (!doc && status.type === "complete") {
    return (
      <div className="h-screen py-1 pr-1 flex flex-col pl-1">
        <Surface className="flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-y-2">
            <span className="text-sm font-medium text-gray-900">
              Document not found
            </span>
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

  return <Editor doc={doc} key={id} />;
}
