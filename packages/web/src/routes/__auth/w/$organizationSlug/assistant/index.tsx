import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant/")({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  // The parent layout (assistant.tsx) renders the actual UI
  // This route exists only for URL matching
  return null;
}
