import { createFileRoute } from "@tanstack/react-router"
import { Form } from "react-aria-components"
import { useAppForm } from "@/hooks/use-app-form"
import { Button } from "@/components/generic/Button"
import { Heading } from "@/components/generic/Heading"
import { useZero } from "@/services/zero"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { createId } from "@lydie/core/id"
import { toast } from "sonner"
import { slugify } from "@lydie/core/utils"
import { authClient } from "@/utils/auth"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery as useZeroQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { revalidateSession } from "@/lib/auth/session"
import { mutators } from "@lydie/zero/mutators"
import { clearZeroInstance } from "@/lib/zero/instance"
import { useTrackOnMount } from "@/hooks/use-posthog-tracking"
import { trackEvent } from "@/lib/posthog"
import { getRandomWorkspaceColor } from "@lydie/core/workspace-colors"

export const Route = createFileRoute("/__auth/new/")({
  component: RouteComponent,
})

function RouteComponent() {
  const z = useZero()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { auth } = Route.useRouteContext()

  // Track onboarding started
  useTrackOnMount("onboarding_started")

  const defaultName = auth?.user?.name ? `${auth.user.name.split(" ")[0]}'s Workspace` : "My Workspace"

  const form = useAppForm({
    defaultValues: {
      name: defaultName,
      slug: slugify(defaultName),
    },
    onSubmit: async (values) => {
      try {
        const id = createId()
        const slug = values.value.slug || slugify(values.value.name)

        const write = z.mutate(
          mutators.organization.create({
            id,
            name: values.value.name,
            slug,
            color: getRandomWorkspaceColor(),
            importDemoContent: true, // Always import demo content
          }),
        )

        // Wait for the server to exist in the database.
        await write.server

        await revalidateSession(queryClient)
        clearZeroInstance()
        await router.invalidate()

        // Track organization created and onboarding completed
        trackEvent("organization_created", {
          organizationId: id,
          organizationSlug: slug,
          organizationName: values.value.name,
        })
        trackEvent("onboarding_completed")

        navigate({
          to: "/w/$organizationSlug",
          params: { organizationSlug: slug },
        })

        toast.success("Workspace created successfully")
      } catch (error) {
        console.error("Failed to create workspace:", error)
        toast.error("Failed to create workspace")
      }
    },
  })

  const [invitations] = useZeroQuery(queries.invitations.byUser({ email: auth?.user?.email || "" }))

  const acceptInvitation = async (invitationId: string) => {
    try {
      await authClient.organization.acceptInvitation({
        invitationId,
      })
      await revalidateSession(queryClient)
      await router.invalidate()
      toast.success("Invitation accepted")
      // Redirect to home or specific workspace logic will be handled by auth state change or manual redirect
      // Often accepting invitation sets active organization, but we should redirect.
      // We can fetch user orgs and redirect to the new one.
      navigate({ to: "/" })
    } catch (error) {
      toast.error("Failed to accept invitation")
    }
  }

  return (
    <div className="min-h-screen relative grainy-gradient-container custom-inner-shadow overflow-hidden">
      <div className="absolute bottom-0 inset-x-0 h-22 bg-linear-to-t from-black/20 z-20"></div>
      <svg className="grainy-gradient-svg">
        <filter id="noiseFilter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          ></feTurbulence>
        </filter>
      </svg>
      <svg
        viewBox="0 0 256 256"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          top: "50%",
          right: "20%",
          transform: "translateY(-50%)",
          width: "2000px",
          pointerEvents: "none",
          zIndex: 2,
          color: "rgba(0, 0, 0, 0.2)",
        }}
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M41.27 222.049c-.67-.618-.218-1.727.695-1.712 37.82.621 81.574-4.599 123.467-20.608 31.858-12.175 62.564-30.604 88.556-57.154.664-.679 1.812-.141 1.699.802C248.073 206.82 193.944 256 128.302 256c-33.588 0-64.162-12.876-87.032-33.951ZM8.475 172.36a.985.985 0 0 1-.797-.643C2.71 158.076 0 143.354 0 128 0 57.308 57.443 0 128.302 0c53.062 0 98.601 32.136 118.129 77.965a.999.999 0 0 1-.072.916c-24.815 39.85-59.9 64.094-97.239 78.364-49.113 18.769-102.352 20.214-140.645 15.115Z"
          clipRule="evenodd"
        ></path>
      </svg>
      <div className="relative z-10 flex items-center justify-center min-h-screen p-8 md:p-16">
        <div className="w-full max-w-lg">
          <div className="p-px ring ring-white/20 rounded-[9px] bg-white/10">
            <div className="p-8 md:p-16 size-full rounded-[8px] flex flex-col gap-8">
              <Form
                onSubmit={(e) => {
                  e.preventDefault()
                  form.handleSubmit()
                }}
                className="flex flex-col gap-y-8"
              >
                <div className="gap-y-2 flex flex-col">
                  <Heading className="text-white">Create Workspace</Heading>
                  <p className="text-white/90">
                    Use workspaces for different areas of your company, or to separate your live and test
                    environments.
                  </p>
                </div>

                <div className="gap-y-4 flex flex-col">
                  <form.AppField
                    name="name"
                    children={(field) => (
                      <field.TextField
                        autoFocus
                        label="Workspace Name"
                        placeholder="My Workspace"
                        description="This will be the name of your workspace"
                        labelClassName="text-white"
                        descriptionClassName="text-white/70"
                        className="text-white"
                        onChange={(v) => {
                          field.handleChange(v)
                          const newSlug = slugify(v)
                          form.setFieldValue("slug", newSlug)
                        }}
                      />
                    )}
                  />

                  <form.AppField
                    name="slug"
                    children={(field) => (
                      <field.TextField
                        label="Workspace Slug"
                        placeholder="my-workspace"
                        description="This will be the URL of your workspace"
                        labelClassName="text-white"
                        descriptionClassName="text-white/70"
                        className="text-white"
                      />
                    )}
                  />

                  <Button
                    intent="primary"
                    type="submit"
                    isPending={form.state.isSubmitting}
                    className="w-full"
                  >
                    {form.state.isSubmitting ? "Creating workspace..." : "Create Workspace"}
                  </Button>
                </div>
              </Form>

              {invitations && invitations.length > 0 && (
                <div className="border-t border-white/10 pt-8">
                  <div className="gap-y-2 flex flex-col mb-4">
                    <Heading className="text-white text-lg">Detailed Invitations</Heading>
                    <p className="text-white/90 text-sm">
                      You have been invited to join the following workspaces using {auth?.user?.email}.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {invitations.map((invitation: any) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/10"
                      >
                        <div className="flex flex-col">
                          <span className="text-white font-medium">
                            {invitation.organization?.name || "Unknown Organization"}
                          </span>
                          <span className="text-white/60 text-xs">
                            Invited by {invitation.inviter?.email || "Unknown"}
                          </span>
                        </div>
                        <Button size="sm" onPress={() => acceptInvitation(invitation.id)}>
                          Accept
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
