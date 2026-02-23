import { SettingsRegular } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Input } from "@lydie/ui/components/generic/Field";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { TextField } from "react-aria-components";
import { toast } from "sonner";

import { useCollectionTabSync } from "@/components/layout/DocumentTabBar";
import { CollectionTable } from "@/components/modules";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute("/__auth/w/$organizationSlug/collections/$collectionId")({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  const { collectionId } = Route.useParams();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);

  const [collection, status] = useQuery(
    queries.collections.byId({
      organizationId: organization.id,
      collectionId,
    }),
  );

  useCollectionTabSync(collection?.id, collection?.name);

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

  return (
    <CollectionPage collection={collection} organization={organization} userIsAdmin={userIsAdmin} />
  );
}

interface CollectionPageProps {
  collection: {
    id: string;
    name: string;
    handle: string;
    properties: unknown;
  };
  organization: {
    id: string;
    slug: string;
  };
  userIsAdmin: boolean;
}

function CollectionPage({ collection, organization, userIsAdmin }: CollectionPageProps) {
  const z = useZero();
  const schema = (collection.properties as PropertyDefinition[] | null) ?? [];
  const [name, setName] = useState(collection.name);
  const [isSavingName, setIsSavingName] = useState(false);

  const saveName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === collection.name) {
      return;
    }

    setIsSavingName(true);
    try {
      await z.mutate(
        mutators.collection.update({
          collectionId: collection.id,
          organizationId: organization.id,
          name: trimmed,
        }),
      );
      toast.success("Collection name updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update collection name");
      setName(collection.name);
    } finally {
      setIsSavingName(false);
    }
  }, [name, collection.id, collection.name, organization.id, z]);

  const handleCreateRow = useCallback(() => {
    z.mutate(
      mutators.document.create({
        id: createId(),
        organizationId: organization.id,
        collectionId: collection.id,
        title: "",
      }),
    );
  }, [collection.id, organization.id, z]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-black/6 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {userIsAdmin ? (
            <TextField
              value={name}
              onChange={setName}
              aria-label="Collection name"
              className="flex items-center gap-2"
              onBlur={() => void saveName()}
            >
              <Input
                className="
                  text-xl font-semibold text-gray-900 p-0 min-w-0 flex-1
                  border-0 !border-0 bg-transparent !bg-transparent
                  outline-none !outline-none ring-0 !ring-0
                  focus:border-0 focus:!border-0 focus:ring-0 focus:!ring-0
                  focus:outline-none focus:!outline-none
                  shadow-none !shadow-none
                "
              />
            </TextField>
          ) : (
            <h1 className="text-xl font-semibold text-gray-900">{collection.name}</h1>
          )}
          <p className="text-sm text-gray-500 mt-1">
            /{collection.handle}
            {isSavingName && <span className="ml-2 text-gray-400">Saving...</span>}
          </p>
        </div>
        {userIsAdmin && (
          <Button
            intent="ghost"
            size="sm"
            href={`/w/${organization.slug}/collections/${collection.id}/settings`}
          >
            <SettingsRegular className="w-4 h-4 mr-1" />
            Settings
          </Button>
        )}
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <CollectionTable
              collectionId={collection.id}
              organizationId={organization.id}
              organizationSlug={organization.slug}
              schema={schema}
              showCreateRowButton={false}
            />
          </div>
          <div className="px-3 py-1">
            <button
              type="button"
              onClick={handleCreateRow}
              className="w-full text-left text-sm text-gray-400 transition-colors hover:text-gray-600"
            >
              New
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
