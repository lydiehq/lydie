import { Card } from "@/components/layout/Card";
import { HomeFileExplorer } from "@/components/home-file-explorer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/__auth/w/$organizationId/")({
  component: RouteComponent,
  validateSearch: z.object({
    tree: z.string().optional(),
    q: z.string().optional(),
    focusSearch: z.boolean().optional(),
  }),
});

function RouteComponent() {
  return (
    <div className="p-1 size-full">
      <Card>
        <HomeFileExplorer />
      </Card>
    </div>
  );
}
