import { createFileRoute } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"

export const Route = createFileRoute("/__auth/w/$organizationSlug/")({
  component: PageComponent,
  ssr: false,
})

function PageComponent() {
  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-y-auto size-full">
        <div className="flex items-center justify-center size-full">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No documents yet</h2>
            <p className="text-gray-600">Create your first document to get started</p>
          </div>
        </div>
      </Surface>
    </div>
  )
}
