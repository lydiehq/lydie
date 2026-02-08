import { TrashPage } from "@/components/trash/TrashPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/__auth/w/$organizationSlug/trash")({
  component: TrashPage,
});
