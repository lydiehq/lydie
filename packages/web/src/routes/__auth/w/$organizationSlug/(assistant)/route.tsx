import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/__auth/w/$organizationSlug/(assistant)")({
  component: AssistantLayout,
  ssr: false,
})

function AssistantLayout() {
  return <Outlet />
}
