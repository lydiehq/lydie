import type { PropertyDefinition } from "@lydie/core/collection";
import { Button } from "@lydie/ui/components/generic/Button";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { PropertyManager } from "@/components/collection";
import { RecordsTable } from "@/components/modules";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute("/__auth/w/$organizationSlug/collections/$handle")({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  const { handle } = Route.useParams();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);

  const [collection, status] = useQuery(
    queries.collections.byHandle({
      organizationId: organization.id,
      handle,
    }),
  );

  if (!collection && status.type === "complete") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center justify-center gap-y-2">
          <span className="text-sm font-medium text-gray-900">Collection not found</span>
          <Button size="sm" href={`/w/${organization.slug}`}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!collection) {
    return null;
  }

  const schema = (collection.properties as PropertyDefinition[] | null) ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-black/6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{collection.name}</h1>
          <p className="text-sm text-gray-500">/{collection.handle}</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="rounded-xl border border-black/8 p-4 space-y-4">
          <PropertyManager
            collectionId={collection.id}
            organizationId={organization.id}
            schema={schema}
            isAdmin={userIsAdmin}
          />
        </div>

        <RecordsTable
          collectionId={collection.id}
          organizationId={organization.id}
          organizationSlug={organization.slug}
          schema={schema}
        />
      </div>
    </div>
  );
}
