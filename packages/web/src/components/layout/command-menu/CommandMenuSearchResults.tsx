import { Command } from "cmdk"
import { DocumentFilled, PlugConnectedRegular } from "@fluentui/react-icons"

function getIntegrationIcon(integrationType: string | null | undefined) {
  if (!integrationType) return null

  switch (integrationType.toLowerCase()) {
    case "github":
    case "shopify":
    default:
      return PlugConnectedRegular
  }
}

interface SearchResultsProps {
  searchDocuments: any[]
  integrationLinks: any[]
  organizationId: string
  onNavigate: (options: any) => void
}

export function SearchResults({
  searchDocuments,
  integrationLinks,
  organizationId,
  onNavigate,
}: SearchResultsProps) {
  function CommandGroupHeading({ children }: { children: React.ReactNode }) {
    return <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1 text-left">{children}</div>
  }

  return (
    <Command.Group heading={<CommandGroupHeading>Search Results</CommandGroupHeading>}>
      {searchDocuments.map((doc) => {
        const link = integrationLinks?.find((l) => l.id === doc.integration_link_id)
        const IntegrationIcon = link?.connection ? getIntegrationIcon(link.connection.integration_type) : null

        return (
          <Command.Item
            key={`search-document-${doc.id}`}
            value={`search-document-${doc.id}-${doc.title || "Untitled Document"}`}
            onSelect={() =>
              onNavigate({
                to: "/w/$organizationSlug/$id",
                params: {
                  organizationId,
                  id: doc.id,
                },
              })
            }
            className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-950 text-gray-800"
          >
            <div className="flex items-center gap-1 mr-2">
              <DocumentFilled className="size-4.5 text-gray-400" />
              {IntegrationIcon && <IntegrationIcon className="size-3 text-blue-500" />}
            </div>
            <span className="truncate">{doc.title || "Untitled Document"}</span>
          </Command.Item>
        )
      })}
    </Command.Group>
  )
}
