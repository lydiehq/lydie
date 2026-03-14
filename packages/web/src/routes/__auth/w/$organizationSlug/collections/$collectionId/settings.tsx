import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { Form } from "react-aria-components";
import { toast } from "sonner";
import type { PropertyDefinition } from "@lydie/core/collection";

import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useZero } from "@/services/zero";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/collections/$collectionId/settings",
)({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  const { collectionId } = Route.useParams();
  const { organization } = useOrganization();

  const [collection, status] = useQuery(
    queries.collections.byId({
      organizationId: organization.id,
      collectionId,
    }),
  );

  useDocumentTitle(collection ? `${collection.name} Settings` : "Collection Settings");

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
    <CollectionSettings collection={collection} organization={organization} />
  );
}

interface CollectionSettingsProps {
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
}

function getLookupSettings(properties: unknown): { lookupKey: string; indexedFields: string[] } {
  const schema = Array.isArray(properties) ? (properties as PropertyDefinition[]) : [];
  const lookupKey = schema.find((property) => property.unique)?.name ?? "";
  const indexedFields = schema.filter((property) => property.indexed).map((property) => property.name);
  return { lookupKey, indexedFields };
}

function applyLookupSettings(
  properties: unknown,
  lookupKey: string,
  indexedFields: string[],
): PropertyDefinition[] {
  const schema = Array.isArray(properties) ? (properties as PropertyDefinition[]) : [];
  return schema.map((property) => ({
    ...property,
    unique: lookupKey.length > 0 ? property.name === lookupKey : false,
    indexed: indexedFields.includes(property.name),
  }));
}

function CollectionSettings({ collection, organization }: CollectionSettingsProps) {
  const z = useZero();
  const [usages] = useQuery(
    queries.collections.viewUsagesByCollection({
      organizationId: organization.id,
      collectionId: collection.id,
    }) as any,
  );
  const usageCount = (usages ?? []).length;
  const referencingDocumentTitles = Array.from(
    new Set(
      (usages ?? [])
        .map((usage: any) => usage.document?.title)
        .filter((title: unknown): title is string => typeof title === "string" && title.length > 0),
    ),
  );
  const lookupSettings = getLookupSettings(collection.properties);

  const handleForm = useAppForm({
    defaultValues: {
      handle: collection.handle,
    },
    onSubmit: async ({ value }) => {
      const trimmed = value.handle.trim();
      if (!trimmed || trimmed === collection.handle) {
        return;
      }

      try {
        await z.mutate(
          mutators.collection.update({
            collectionId: collection.id,
            organizationId: organization.id,
            handle: trimmed,
          }),
        );
        toast.success("Collection handle updated");
        handleForm.reset();
      } catch (error) {
        console.error(error);
        toast.error("Failed to update collection handle");
      }
    },
  });

  const lookupForm = useAppForm({
    defaultValues: {
      lookupKey: lookupSettings.lookupKey,
      indexedFields: lookupSettings.indexedFields.join(", "),
    },
    onSubmit: async ({ value }) => {
      const lookupKey = value.lookupKey.trim();
      const indexedFields = value.indexedFields
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 3);

      try {
        await z.mutate(
          mutators.collection.update({
            collectionId: collection.id,
            organizationId: organization.id,
            properties: applyLookupSettings(collection.properties, lookupKey, indexedFields),
          }),
        );
        toast.success("Collection API lookup settings updated");
        lookupForm.reset();
      } catch (error) {
        console.error(error);
        toast.error("Failed to update collection API lookup settings");
      }
    },
  });

  const handleDeleteCollection = async () => {
    const referencingDocumentsMessage =
      referencingDocumentTitles.length > 0
        ? `\n\nReferenced in:\n${referencingDocumentTitles.map((title) => `- ${title}`).join("\n")}`
        : "";
    const warning =
      usageCount > 0
        ? `This collection is referenced by ${usageCount} view block${usageCount === 1 ? "" : "s"}. If you continue, those blocks will be disconnected from this collection.${referencingDocumentsMessage}`
        : "This action cannot be undone.";

    if (!window.confirm(`Delete collection "${collection.name}"?\n\n${warning}`)) {
      return;
    }

    try {
      await z.mutate(
        mutators.collection.delete({
          collectionId: collection.id,
          organizationId: organization.id,
          force: usageCount > 0,
        }),
      );
      toast.success("Collection deleted");
      window.location.assign(`/w/${organization.slug}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete collection");
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level={1}>Collection Settings</Heading>
          <p className="text-sm text-gray-500 mt-1">{collection.name}</p>
        </div>
        <Button
          intent="ghost"
          size="sm"
          href={`/w/${organization.slug}/collections/${collection.id}`}
        >
          Back to collection
        </Button>
      </div>
      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="Handle"
          description="The handle is used in URLs to identify this collection."
        />
        <Form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleForm.handleSubmit();
          }}
        >
          <div className="flex-1 max-w-md">
            <handleForm.AppField
              name="handle"
              children={(field) => <field.TextField label="Handle" />}
            />
          </div>
          <handleForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
              handleValue: state.values.handle,
            })}
            children={({ canSubmit, isSubmitting, handleValue }) => (
              <Button
                size="sm"
                type="submit"
                isDisabled={!canSubmit || handleValue.trim() === collection.handle}
              >
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            )}
          />
        </Form>
      </div>

      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="API Lookup"
          description="Choose one lookup property and up to 3 indexed fields for external API filters."
        />
        <Form
          className="flex flex-col gap-3 max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupForm.handleSubmit();
          }}
        >
          <lookupForm.AppField
            name="lookupKey"
            children={(field) => <field.TextField label="Lookup key property (optional)" />}
          />
          <lookupForm.AppField
            name="indexedFields"
            children={(field) => (
              <field.TextField label="Indexed fields (comma-separated, max 3)" />
            )}
          />
          <lookupForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
            children={({ canSubmit, isSubmitting }) => (
              <Button size="sm" type="submit" isDisabled={!canSubmit}>
                {isSubmitting ? "Saving..." : "Apply API settings"}
              </Button>
            )}
          />
        </Form>
      </div>

      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader heading="Danger Zone" description="Irreversible and destructive actions." />
        <Button
          intent="ghost"
          size="sm"
          onPress={() => void handleDeleteCollection()}
          className="w-fit text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          Delete collection
        </Button>
      </div>
    </div>
  );
}
