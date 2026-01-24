import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useZero } from "@/services/zero"
import { mutators } from "@lydie/zero/mutators"
import { OrganizationAvatar } from "@/components/layout/OrganizationAvatar"
import { Button } from "@/components/generic/Button"
import { Heading } from "@/components/generic/Heading"
import { toast } from "sonner"
import { ChevronRightRegular } from "@fluentui/react-icons"

export const Route = createFileRoute("/__auth/install-template")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      template: (search.template as string) || "",
    }
  },
})

function RouteComponent() {
  const { template } = Route.useSearch()
  const { organizations } = Route.useRouteContext()
  const navigate = useNavigate()
  const z = useZero()
  const [installing, setInstalling] = useState<string | null>(null)

  if (!template) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Heading>Invalid Request</Heading>
          <p className="text-gray-600 mt-2">No template specified.</p>
          <Button href="/templates" className="mt-4">
            Browse Templates
          </Button>
        </div>
      </div>
    )
  }

  const handleInstall = async (organizationId: string, organizationSlug: string) => {
    setInstalling(organizationId)
    try {
      const result = await z.mutate(
        mutators.template.install({
          templateSlug: template,
          organizationId,
        }),
      )

      if (result?.client) {
        await result.client
      }

      toast.success("Template installed successfully!")

      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug },
      })
    } catch (error) {
      console.error("Failed to install template:", error)
      toast.error("Failed to install template. Please try again.")
      setInstalling(null)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <Heading className="text-2xl mb-2">Choose a Workspace</Heading>
          <p className="text-gray-600">Select where you'd like to install this template</p>
        </div>

        <div className="space-y-2">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleInstall(org.id, org.slug || org.id)}
              disabled={installing !== null}
              className="w-full flex items-center gap-x-3 p-4 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <OrganizationAvatar organization={org} size="lg" />
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900">{org.name}</div>
                {installing === org.id && <div className="text-sm text-gray-500">Installing...</div>}
              </div>
              <ChevronRightRegular className="size-5 text-gray-400 group-hover:text-gray-600" />
            </button>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Button href="/new" intent="secondary" size="sm">
            Create New Workspace
          </Button>
        </div>
      </div>
    </div>
  )
}
