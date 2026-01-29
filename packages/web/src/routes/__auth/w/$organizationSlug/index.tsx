import { createFileRoute } from "@tanstack/react-router";

import { Surface } from "@/components/layout/Surface";

export const Route = createFileRoute("/__auth/w/$organizationSlug/")({
  component: PageComponent,
});

function PageComponent() {
  return (
    <div className="h-screen p-1">
      <Surface className="overflow-y-auto size-full">
        <div className="flex items-center justify-center size-full">
          <div className="flex flex-col items-center justify-center gap-y-2">
            <span className="font-medium text-gray-900">Welcome to your workspace!</span>
            <p className="text-sm text-gray-500">
              This page will soon become the home page for your workspace.
            </p>
          </div>
        </div>
      </Surface>
    </div>
  );
}
