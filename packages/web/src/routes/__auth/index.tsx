import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute("/__auth/")({
  component: RouteComponent,
  validateSearch: (search) => z.object({ template: z.string().optional() }).parse(search),
  beforeLoad: async ({ context: { auth }, search }) => {
    let templateSlug = search.template;
    if (!templateSlug && typeof window !== "undefined") {
      const pendingTemplate = sessionStorage.getItem("pendingTemplateInstall");
      if (pendingTemplate) {
        templateSlug = pendingTemplate;
        sessionStorage.removeItem("pendingTemplateInstall");
      }
    }

    const activeOrganizationSlug = (auth?.session as any)?.activeOrganizationSlug;
    const organizations = (auth?.session as any)?.organizations || [];

    if (activeOrganizationSlug) {
      throw redirect({
        to: "/w/$organizationSlug",
        params: { organizationSlug: activeOrganizationSlug },
        search: templateSlug ? { installTemplate: templateSlug } : { installTemplate: undefined },
      });
    }

    if (organizations.length > 0) {
      const firstOrg = organizations[0];
      throw redirect({
        to: "/w/$organizationSlug",
        params: { organizationSlug: firstOrg.slug },
        search: templateSlug ? { installTemplate: templateSlug } : { installTemplate: undefined },
      });
    }

    throw redirect({
      to: "/new",
      search: { template: templateSlug || undefined },
    });
  },
});

function RouteComponent() {
  return <div></div>;
}
