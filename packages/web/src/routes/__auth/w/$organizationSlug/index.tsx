import { Surface } from "@/components/layout/Surface";
import { HomeFileExplorer } from "@/components/home-file-explorer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/__auth/w/$organizationSlug/")({
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
      <Surface>
        <HomeFileExplorer />
      </Surface>
    </div>
  );
}
