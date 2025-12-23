import { createFileRoute, redirect } from "@tanstack/react-router";
import { listOrganizationsQuery } from "@/utils/auth";
import { getActiveOrganizationId } from "@/lib/active-organization";
import { LocalDocumentMigration } from "@/components/auth/LocalDocumentMigration";
import { useState, useEffect } from "react";
import { queries } from "@lydie/zero/queries";
import { LOCAL_ORG_ID } from "@/lib/local-organization";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/old-tbd")({
  component: RouteComponent,
  beforeLoad: async ({ context: { queryClient } }) => {
    const activeOrganizationId = getActiveOrganizationId();

    if (activeOrganizationId) {
      throw redirect({
        to: "/w/$organizationId",
        params: { organizationId: activeOrganizationId },
      });
    }

    const organizations = await queryClient.ensureQueryData({
      ...listOrganizationsQuery,
    });

    if (organizations && organizations.length > 0) {
      // Don't automatically redirect - let component check for local docs first
      return { organizations };
    }

    // No organizations found - redirect to onboarding to create one
    throw redirect({ to: "/onboarding" });
  },
});

function RouteComponent() {
  const { organizations } = Route.useLoaderData();
  const navigate = useNavigate();
  const { zero } = Route.useRouteContext();
  const [showMigration, setShowMigration] = useState(false);
  const [hasLocalDocs, setHasLocalDocs] = useState(false);

  useEffect(() => {
    // Check if there are local documents
    const checkLocalDocs = async () => {
      const localData = await zero.query(
        queries.organizations.documentsAndFolders({
          organizationId: LOCAL_ORG_ID,
        })
      );

      const hasData =
        (localData?.documents?.length || 0) > 0 ||
        (localData?.folders?.length || 0) > 0;

      setHasLocalDocs(hasData);
      setShowMigration(hasData);

      // If no local docs, redirect immediately
      if (!hasData && organizations && organizations.length > 0) {
        navigate({
          to: "/w/$organizationId",
          params: { organizationId: organizations[0].id },
        });
      }
    };

    checkLocalDocs();
  }, [zero, organizations, navigate]);

  if (!organizations || organizations.length === 0) {
    return null;
  }

  const targetOrganization = organizations[0];

  return (
    <>
      {hasLocalDocs && (
        <LocalDocumentMigration
          isOpen={showMigration}
          onOpenChange={(open) => {
            setShowMigration(open);
            if (!open) {
              // After migration dialog closes, redirect to workspace
              navigate({
                to: "/w/$organizationId",
                params: { organizationId: targetOrganization.id },
              });
            }
          }}
          targetOrganizationId={targetOrganization.id}
          targetOrganizationName={targetOrganization.name}
        />
      )}
    </>
  );
}
