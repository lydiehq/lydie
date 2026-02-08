import { createFileRoute } from "@tanstack/react-router";

import { TrashPage } from "@/components/trash/TrashPage";

export const Route = createFileRoute("/__auth/w/$organizationSlug/trash")({
  component: TrashPage,
});
