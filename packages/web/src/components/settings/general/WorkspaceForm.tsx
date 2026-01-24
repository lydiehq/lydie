import { Form } from "react-aria-components"
import { Button } from "@/components/generic/Button"
import { useAppForm } from "@/hooks/use-app-form"
import { slugify } from "@lydie/core/utils"
import { toast } from "sonner"
import { useZero } from "@/services/zero"
import { mutators } from "@lydie/zero/mutators"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { revalidateSession } from "@/lib/auth/session"
import { OrganizationColorPicker } from "./OrganizationColorPicker"
import { WORKSPACE_COLORS } from "@lydie/core/workspace-colors"
import { useState } from "react"

type WorkspaceFormProps = {
  organization: {
    id: string
    name: string
    slug: string
    color: string | null
  }
}

export function WorkspaceForm({ organization }: WorkspaceFormProps) {
  const z = useZero()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedColor, setSelectedColor] = useState<string>(
    organization.color || WORKSPACE_COLORS[0].value,
  )

  const workspaceForm = useAppForm({
    defaultValues: {
      name: organization.name,
      slug: organization.slug,
    },
    onSubmit: async (values) => {
      if (!values.value.name.trim()) {
        toast.error("Workspace name cannot be empty")
        return
      }

      if (!values.value.slug.trim()) {
        toast.error("Workspace slug cannot be empty")
        return
      }

      const slugified = slugify(values.value.slug.trim())
      if (slugified !== values.value.slug.trim()) {
        toast.error("Slug contains invalid characters. Only letters, numbers, and hyphens are allowed.")
        return
      }

      const hasChanges =
        values.value.name.trim() !== organization.name ||
        slugified !== organization.slug ||
        selectedColor !== organization.color

      if (!hasChanges) {
        return
      }

      const slugChanged = slugified !== organization.slug
      let mutationSucceeded = false

      try {
        const write = z.mutate(
          mutators.organization.update({
            organizationId: organization.id,
            name: values.value.name.trim(),
            slug: slugified,
            color: selectedColor,
          }),
        )

        await write.server

        mutationSucceeded = true

        toast.success("Workspace updated successfully")

        if (slugChanged && mutationSucceeded) {
          try {
            await revalidateSession(queryClient)
          } catch (sessionError) {
            // If session refresh fails, log but don't block navigation
            console.error("Failed to refresh session:", sessionError)
          }

          navigate({
            to: "/w/$organizationSlug/settings",
            params: { organizationSlug: slugified },
          })
        }
      } catch (error: any) {
        let errorMessage = "Failed to update workspace"

        if (error?.message) {
          if (error.message === "Slug is already taken") {
            errorMessage = "This slug is already taken. Please choose a different one."
          } else if (error.message.includes("Access denied")) {
            errorMessage = "You don't have permission to update this workspace."
          } else {
            errorMessage = error.message
          }
        } else if (error?.toString) {
          errorMessage = error.toString()
        }

        toast.error(errorMessage)
        console.error("Workspace update error:", error)

        mutationSucceeded = false
        return
      }
    },
  })

  return (
    <Form
      className="flex flex-col gap-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        workspaceForm.handleSubmit()
      }}
    >
      <workspaceForm.AppField
        name="name"
        children={(field) => <field.TextField label="Workspace Name" />}
      />
      <workspaceForm.AppField
        name="slug"
        listeners={{
          onBlur: (e) => {
            const slugified = slugify(e.value)
            workspaceForm.setFieldValue("slug", slugified)
          },
        }}
        children={(field) => (
          <field.TextField
            label="Workspace Slug"
            description="Used in URLs and API endpoints. Only letters, numbers, and hyphens are allowed."
          />
        )}
      />
      <OrganizationColorPicker selectedColor={selectedColor} onColorChange={setSelectedColor} />
      <div className="flex justify-end gap-x-1">
        <Button
          intent="secondary"
          size="sm"
          onPress={() => {
            workspaceForm.reset()
            setSelectedColor(organization.color || WORKSPACE_COLORS[0].value)
          }}
        >
          Cancel
        </Button>
        <Button size="sm" type="submit" isPending={workspaceForm.state.isSubmitting}>
          {workspaceForm.state.isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </Form>
  )
}
