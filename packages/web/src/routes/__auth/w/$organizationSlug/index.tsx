import { Document16Regular } from "@fluentui/react-icons";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";

import { Surface } from "@/components/layout/Surface";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/")({
  component: PageComponent,
});

function PageComponent() {
  const { organization } = useOrganization();
  const [latestDocuments] = useQuery(
    queries.documents.latest({
      organizationId: organization.id,
      limit: 10,
    }),
  );

  const hasDocuments = latestDocuments && latestDocuments.length > 0;

  const { user } = useAuth();

  return (
    <div className="h-screen p-1">
      <Surface className="overflow-y-auto size-full">
        <div className="max-w-4xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-medium text-gray-900 mb-2">
              Welcome back, {user?.name ? `${user.name.split(" ")[0]}!` : ""}
            </h1>
            <p className="text-gray-500">Here are the documents you've been working on recently.</p>
          </div>

          {hasDocuments ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-4">
                Recent documents
              </h2>
              <div className="grid gap-2">
                {latestDocuments?.map((doc) => (
                  <Link
                    key={doc.id}
                    to="/w/$organizationSlug/$id"
                    params={{ organizationSlug: organization.slug, id: doc.id }}
                    className="flex items-center gap-2 h-10 px-2 rounded-lg hover:bg-black/3 transition-colors group"
                  >
                    <DocumentIcon className="size-4 icon-muted group-hover:text-gray-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.title || "Untitled document"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Edited{" "}
                        {formatDistanceToNow(new Date(doc.updated_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Document16Regular className="size-12 text-gray-300 mb-4" />
              <p className="text-gray-500 mb-2">No documents yet</p>
              <p className="text-sm text-gray-400">Start creating documents to see them here.</p>
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}
