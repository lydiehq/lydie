import { IntegrationActivityLog } from "@/components/integrations/IntegrationActivityLog"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { useOrganization } from "@/context/organization.context"

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/integrations/$integrationType/activity",
)({
  component: RouteComponent,
})

function RouteComponent() {
  const { integrationType } = Route.useParams()
  const { organization } = useOrganization()
  const [activityLogs] = useQuery(
    queries.integrationActivityLogs.byIntegrationType({
      integrationType,
      organizationId: organization.id,
    }),
  )
  return (
    <div>
      <IntegrationActivityLog logs={activityLogs} />
    </div>
  )
}
