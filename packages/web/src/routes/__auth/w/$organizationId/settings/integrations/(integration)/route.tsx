import { Link } from "@/components/generic/Link";
import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/integrations/(integration)"
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <Link to=".." className="text-sm text-gray-500 mb-4 block">
        Back to Integrations
      </Link>
      <Outlet />
    </div>
  );
}
