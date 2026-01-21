import { useAppForm } from "@/hooks/use-app-form"
import { useAuthenticatedApi } from "@/services/api"
import { useQuery as useTSQQuery } from "@tanstack/react-query"
import { toast } from "sonner"

export type GitHubLinkConfig = {
  owner: string
  repo: string
  branch: string
  basePath: string
}

export type GitHubFormData = {
  repositoryId: string
  branch: string
  basePath: string
  linkName: string
}

export type GitHubFormProps = {
  connectionId: string
  organizationId: string
  onCreate: (name: string, config: GitHubLinkConfig) => Promise<void>
  onCancel: () => void
}

export function GitHubForm({ connectionId, organizationId, onCreate, onCancel }: GitHubFormProps) {
  const { createClient } = useAuthenticatedApi()

  const { data, isLoading } = useTSQQuery<{
    resources: Array<{
      id: string
      name: string
      fullName: string
      metadata?: { defaultBranch?: string }
    }>
  }>({
    initialData: { resources: [] },
    queryKey: ["github-resources", connectionId],
    queryFn: async () => {
      const client = await createClient()
      const res = await client.internal.integrations[":connectionId"].resources.$get({
        param: { connectionId },
      })
      if (!res.ok) {
        throw new Error("Failed to fetch repositories")
      }
      return res.json()
    },
  })

  const resources = data?.resources || []

  const form = useAppForm({
    defaultValues: {
      repositoryId: "",
      branch: "",
      basePath: "",
      linkName: "",
    },
    onSubmit: async (values) => {
      try {
        if (!values.value.repositoryId) {
          toast.error("Please select a repository")
          return
        }

        const selectedResource = resources.find((r) => r.id === values.value.repositoryId)
        if (!selectedResource) {
          toast.error("Selected repository not found")
          return
        }

        const [owner, repo] = selectedResource.fullName.split("/")
        const normalizedBasePath = values.value.basePath.trim().replace(/^\/+|\/+$/g, "")
        const branchName = values.value.branch.trim() || selectedResource.metadata?.defaultBranch || "main"

        const name =
          values.value.linkName.trim() || `${repo}${normalizedBasePath ? `/${normalizedBasePath}` : ""}`

        const config: GitHubLinkConfig = {
          owner,
          repo,
          branch: branchName,
          basePath: normalizedBasePath || "",
        }

        await onCreate(name, config)
      } catch (error) {
        console.error("Failed to create GitHub link:", error)
        toast.error("Failed to create link")
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-y-3"
    >
      <div>
        <h3 className="text-lg font-medium text-gray-900">Add GitHub Link</h3>
        <p className="text-sm text-gray-600 mt-1">
          Select a repository and folder to sync documents from GitHub.
        </p>
      </div>

      <div className="flex flex-col gap-y-3">
        <form.AppField
          name="repositoryId"
          children={(field) => (
            <div className="flex flex-col gap-y-1">
              <label className="text-sm font-medium text-gray-900">Repository</label>
              <select
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={isLoading}
              >
                {isLoading && <option value="">Loading repositories...</option>}
                {!isLoading && resources.length === 0 && <option value="">No repositories available</option>}
                {!isLoading && <option value="">Select a repository</option>}
                {!isLoading &&
                  resources.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.fullName}
                    </option>
                  ))}
              </select>
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
              )}
            </div>
          )}
        />

        <form.AppField
          name="branch"
          children={(field) => (
            <field.TextField
              label="Branch"
              placeholder="main"
              description="Use the branch you want to sync documents from."
            />
          )}
        />

        <form.AppField
          name="basePath"
          children={(field) => (
            <field.TextField
              label="Folder path (optional)"
              placeholder="docs/guides"
              description="Relative path inside the repository. Leave empty to sync from the repository root."
            />
          )}
        />

        <form.AppField
          name="linkName"
          children={(field) => (
            <field.TextField
              label="Link name (optional)"
              placeholder="Web Docs"
              description="Display name for this link. Defaults to the repository and folder path."
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-1.5 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={form.state.isSubmitting}
          className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          {form.state.isSubmitting ? "Creating..." : "Create Link"}
        </button>
      </div>
    </form>
  )
}
