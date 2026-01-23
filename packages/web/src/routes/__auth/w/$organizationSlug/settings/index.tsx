import { Button } from "@/components/generic/Button"
import { useAuthenticatedApi } from "@/services/api"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { useOrganization } from "@/context/organization.context"
import { Separator } from "@/components/generic/Separator"
import { Heading } from "@/components/generic/Heading"
import { SectionHeader } from "@/components/generic/SectionHeader"
import { useQuery } from "@rocicorp/zero/react"
import { useState } from "react"
import { DialogTrigger, Form, MenuTrigger, Button as RACButton } from "react-aria-components"
import { Modal } from "@/components/generic/Modal"
import { Dialog } from "@/components/generic/Dialog"
import { AlertDialog } from "@/components/generic/AlertDialog"
import { Menu, MenuItem } from "@/components/generic/Menu"
import {
  CopyRegular,
  EyeRegular,
  EyeOffRegular,
  AddRegular,
  MoreHorizontalRegular,
  DismissRegular,
  PersonRegular,
  MailRegular,
  ShieldRegular,
  ClockRegular,
  KeyRegular,
} from "@fluentui/react-icons"
import { useZero } from "@/services/zero"
import { queries } from "@lydie/zero/queries"
import { confirmDialog } from "@/stores/confirm-dialog"
import { useAppForm } from "@/hooks/use-app-form"
import { formatDistanceToNow } from "date-fns"
import { mutators } from "@lydie/zero/mutators"
import { Card } from "@/components/layout/Card"
import { slugify } from "@lydie/core/utils"
import { authClient } from "@/utils/auth"
import { useAuth } from "@/context/auth.context"
import { clearActiveOrganizationSlug } from "@/lib/active-organization"
import { WORKSPACE_COLORS } from "@lydie/core/workspace-colors"
import { Popover } from "@/components/generic/Popover"
import { revalidateSession } from "@/lib/auth/session"
import { useQueryClient } from "@tanstack/react-query"

type ApiKeyDialogStep = "create" | "success"

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/")({
  component: RouteComponent,
})

function RouteComponent() {
  const { createClient } = useAuthenticatedApi()
  const { organization } = useOrganization()
  const z = useZero()
  const navigate = useNavigate()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.userId
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false)
  const [apiKeyDialogStep, setApiKeyDialogStep] = useState<ApiKeyDialogStep>("create")
  const [newApiKey, setNewApiKey] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)

  const [selectedColor, setSelectedColor] = useState<string>(organization.color || WORKSPACE_COLORS[0])
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false)

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

        // Wait for the server to confirm the mutation
        // This will throw if the mutation fails on the server
        await write.server

        // Mark as succeeded only after server confirms
        mutationSucceeded = true

        // Only proceed with success actions if we reach here (mutation succeeded)
        toast.success("Workspace updated successfully")

        // If slug changed, refresh session to update the cached organization data
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
        // Extract error message - could be from Zero mutation or network error
        let errorMessage = "Failed to update workspace"

        // TODO: fix this shit and create proper e2e tests for cases where slug
        // is taken etc.

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

        // Ensure we don't navigate on error - mutation failed
        mutationSucceeded = false
        return
      }
    },
  })

  // API key creation form
  const apiKeyForm = useAppForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async (values) => {
      if (!values.value.name.trim()) {
        toast.error("Please enter a name for the API key")
        return
      }

      const client = await createClient()
      try {
        const res = await client.internal.organization["api-key"]
          .$post({
            json: { name: values.value.name.trim() },
          })
          .then((res) => res.json())

        setNewApiKey(res.key)
        setApiKeyDialogStep("success")
        apiKeyForm.reset()
      } catch (error) {
        toast.error("Failed to create API key")
        console.error("API key creation error:", error)
      }
    },
  })

  const handleRevokeApiKey = async (keyId: string, keyName: string) => {
    confirmDialog({
      title: `Revoke API Key "${keyName}"`,
      message: "This action cannot be undone. The API key will be permanently revoked.",
      onConfirm: () => {
        try {
          z.mutate(mutators.apiKey.revoke({ keyId, organizationId: organization.id }))
          toast.success("API key revoked successfully")
        } catch (error) {
          toast.error("Failed to revoke API key")
          console.error("API key revocation error:", error)
        }
      },
    })
  }

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      toast.success("API key copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy API key")
      console.error("Copy error:", error)
    }
  }

  const handleCloseApiKeyDialog = () => {
    setIsApiKeyDialogOpen(false)
    setApiKeyDialogStep("create")
    setNewApiKey("")
    setCopied(false)
    setShowKey(false)
  }

  const handleDeleteOrganization = () => {
    try {
      z.mutate(mutators.organization.delete({ organizationId: organization.id }))
      clearActiveOrganizationSlug(userId)
      toast.success("Organization deleted successfully")
      // Navigate to home - the route will redirect appropriately
      navigate({ to: "/" })
    } catch (error) {
      toast.error("Failed to delete organization")
      console.error("Organization deletion error:", error)
    }
  }

  const [keys] = useQuery(queries.apiKeys.byOrganization({ organizationId: organization.id }))

  const [members] = useQuery(queries.members.byOrganization({ organizationId: organization.id }))

  const [invitations] = useQuery(
    queries.invitations.byOrganization({
      organizationId: organization.id,
    }),
  )

  // Invitation form
  const invitationForm = useAppForm({
    defaultValues: {
      email: "",
      role: "member" as "member" | "admin",
    },
    onSubmit: async (values) => {
      if (!values.value.email.trim()) {
        toast.error("Please enter an email address")
        return
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(values.value.email.trim())) {
        toast.error("Please enter a valid email address")
        return
      }

      try {
        await authClient.organization.inviteMember({
          organizationId: organization.id,
          email: values.value.email.trim(),
          role: values.value.role,
        })
        toast.success("Invitation sent successfully")
        invitationForm.reset()
        setIsInviteDialogOpen(false)
      } catch (error: any) {
        const errorMessage = error?.message?.includes("already")
          ? "This user is already a member or has a pending invitation"
          : "Failed to send invitation"
        toast.error(errorMessage)
        console.error("Invitation error:", error)
      }
    },
  })

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!organization) {
      toast.error("Organization not found")
      return
    }

    confirmDialog({
      title: `Cancel Invitation`,
      message: `Are you sure you want to cancel the invitation for ${email}?`,
      onConfirm: async () => {
        try {
          await authClient.organization.cancelInvitation({
            organizationId: organization.id,
            invitationId,
          })
          toast.success("Invitation canceled")
        } catch (error) {
          toast.error("Failed to cancel invitation")
          console.error("Cancel invitation error:", error)
        }
      },
    })
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!organization) {
      toast.error("Organization not found")
      return
    }

    confirmDialog({
      title: `Remove Member`,
      message: `Are you sure you want to remove ${memberName} from this organization?`,
      onConfirm: async () => {
        try {
          await authClient.organization.removeMember({
            organizationId: organization.id,
            memberId,
          })
          toast.success("Member removed successfully")
        } catch (error) {
          toast.error("Failed to remove member")
          console.error("Remove member error:", error)
        }
      },
    })
  }

  return (
    <div className="flex flex-col gap-y-6">
      <Heading level={1}>Settings</Heading>
      <Separator />
      <div className="flex flex-col gap-y-4">
        <SectionHeader heading="General" description="Update your workspace settings." />
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
          <div className="flex flex-col gap-y-1">
            <label className="text-sm font-medium text-gray-900">Workspace Color</label>
            <div className="flex items-center gap-x-2">
              <MenuTrigger isOpen={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
                <RACButton
                  className="relative h-10 w-20 rounded-md border border-gray-300 shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-gray-500"
                  style={{
                    backgroundColor: selectedColor,
                  }}
                />
                <Popover placement="bottom start" className="p-3">
                  <div className="grid grid-cols-6 gap-2">
                    {WORKSPACE_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setSelectedColor(color)
                          setIsColorPickerOpen(false)
                        }}
                        className="size-8 rounded-md border-2 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500"
                        style={{
                          backgroundColor: color,
                          borderColor: selectedColor === color ? "#000" : "#d1d5db",
                        }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </Popover>
              </MenuTrigger>
              <span className="text-sm text-gray-600">{selectedColor}</span>
            </div>
          </div>
          <div className="flex justify-end gap-x-1">
            <Button
              intent="secondary"
              size="sm"
              onPress={() => {
                workspaceForm.reset()
                setSelectedColor(organization.color || WORKSPACE_COLORS[0])
              }}
            >
              Cancel
            </Button>
            <Button size="sm" type="submit" isPending={workspaceForm.state.isSubmitting}>
              {workspaceForm.state.isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </Form>
      </div>
      <Separator />

      {/* Members & Invitations Section */}
      <div className="flex flex-col gap-y-4">
        <div className="flex justify-between items-start">
          <SectionHeader
            heading="Members & Invitations"
            description="Manage who has access to this workspace."
          />
          <Button onPress={() => setIsInviteDialogOpen(true)} size="sm" intent="secondary">
            <AddRegular className="size-3.5 mr-1" />
            Invite Member
          </Button>
        </div>

        {/* Members */}
        {members && members.length > 0 && (
          <div className="flex flex-col gap-y-2">
            <h3 className="text-sm font-medium text-gray-700">Members</h3>
            <div className="flex flex-col gap-y-3">
              {members.map((member) => (
                <Card key={member.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <PersonRegular className="size-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{member.user?.name || "Unknown"}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <MailRegular className="size-3.5" />
                          <span>{member.user?.email || "Unknown"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ShieldRegular className="size-3.5" />
                          <span>
                            Role: <span className="capitalize font-medium">{member.role}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ClockRegular className="size-3.5" />
                          <span>
                            Joined{" "}
                            {formatDistanceToNow(member.created_at, {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="ml-4">
                      <MenuTrigger>
                        <RACButton>
                          <MoreHorizontalRegular className="size-4 text-gray-500" />
                        </RACButton>
                        <Menu>
                          <MenuItem
                            onAction={() =>
                              handleRemoveMember(
                                member.id,
                                member.user?.name || member.user?.email || "this member",
                              )
                            }
                            className="text-red-600"
                          >
                            Remove Member
                          </MenuItem>
                        </Menu>
                      </MenuTrigger>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Pending Invitations */}
        {invitations && invitations.length > 0 && (
          <div className="flex flex-col gap-y-2">
            <h3 className="text-sm font-medium text-gray-700">Pending Invitations</h3>
            <div className="flex flex-col gap-y-3">
              {invitations.map((invitation) => (
                <Card key={invitation.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <MailIcon className="size-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{invitation.email}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <ShieldRegular className="size-3.5" />
                          <span>
                            Role:{" "}
                            <span className="capitalize font-medium">{invitation.role || "member"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <PersonRegular className="size-3.5" />
                          <span>
                            Invited by: {invitation.inviter?.name || invitation.inviter?.email || "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ClockRegular className="size-3.5" />
                          <span>
                            Expires{" "}
                            {formatDistanceToNow(invitation.expires_at, {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="ml-4">
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => handleCancelInvitation(invitation.id, invitation.email)}
                      >
                        <DismissRegular className="size-3.5 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {(!members || members.length === 0) && (!invitations || invitations.length === 0) && (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">No members or invitations yet</div>
            <div className="text-xs mt-1 text-gray-500">Invite your first team member to get started</div>
          </Card>
        )}
      </div>

      <Separator />

      {/* API Keys Section */}
      <div className="flex flex-col gap-y-2">
        <div className="flex justify-between">
          <SectionHeader
            heading="API Key Management"
            description="Create an API key to access the API."
            descriptionClassName="text-sm/relaxed text-gray-700"
          />
          <Button
            onPress={() => {
              setIsApiKeyDialogOpen(true)
              setApiKeyDialogStep("create")
            }}
            size="sm"
            intent="secondary"
          >
            <AddRegular className="size-3.5 mr-1" />
            Create API Key
          </Button>
        </div>

        {keys && keys.length > 0 ? (
          <div className="flex flex-col gap-y-3">
            {keys.map((key) => (
              <Card key={key.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <KeyRegular className="size-4 text-gray-500" />
                      <span className="font-medium text-gray-900">{key.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <ClockRegular className="size-3.5" />
                        <span>
                          Created{" "}
                          {formatDistanceToNow(key.created_at, {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ClockRegular className="size-3.5" />
                        <span>
                          Last used:{" "}
                          {key.last_used_at
                            ? formatDistanceToNow(key.last_used_at, {
                                addSuffix: true,
                              })
                            : "Never"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <KeyRegular className="size-3.5" />
                        <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                          {key.partial_key}
                        </code>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4">
                    <MenuTrigger>
                      <RACButton>
                        <MoreHorizontalRegular className="size-4 text-gray-500" />
                      </RACButton>
                      <Menu>
                        <MenuItem
                          onAction={() => handleRevokeApiKey(key.id, key.name)}
                          className="text-red-600"
                        >
                          Revoke Key
                        </MenuItem>
                      </Menu>
                    </MenuTrigger>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">No API keys created yet</div>
            <div className="text-xs mt-1 text-gray-500">Create your first API key to get started</div>
          </Card>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader heading="Danger Zone" description="Irreversible and destructive actions." />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-y-2">
            <div className="flex flex-col gap-y-0.5">
              <h3 className="text-sm font-medium text-red-900">Delete workspace</h3>
              <p className="text-sm text-red-700">
                Once you delete an organization, there is no going back. This will permanently delete the
                organization and all associated data, including documents, API keys, and settings.
              </p>
            </div>
            <div className="flex justify-end">
              <Button intent="danger" size="sm" onPress={() => setIsDeleteDialogOpen(true)}>
                Delete Organization
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ApiKeyDialog
        isOpen={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
        step={apiKeyDialogStep}
        apiKeyForm={apiKeyForm}
        newApiKey={newApiKey}
        showKey={showKey}
        copied={copied}
        onShowKeyChange={setShowKey}
        onCopyKey={handleCopyKey}
        onClose={handleCloseApiKeyDialog}
      />

      <InviteDialog
        isOpen={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        invitationForm={invitationForm}
      />

      <DialogTrigger isOpen={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <Modal isDismissable>
          <AlertDialog
            title="Delete Organization"
            variant="destructive"
            actionLabel="Delete Organization"
            cancelLabel="Cancel"
            onAction={handleDeleteOrganization}
          >
            Are you absolutely sure you want to delete this organization? This action cannot be undone. This
            will permanently delete the organization and all associated data, including:
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li>All documents</li>
              <li>All API keys</li>
              <li>All organization settings</li>
              <li>All conversations and messages</li>
              <li>All other associated data</li>
            </ul>
          </AlertDialog>
        </Modal>
      </DialogTrigger>
    </div>
  )
}

type ApiKeyDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  step: ApiKeyDialogStep
  apiKeyForm: any // Form type from useAppForm is complex to type properly
  newApiKey: string
  showKey: boolean
  copied: boolean
  onShowKeyChange: (show: boolean) => void
  onCopyKey: (key: string) => void
  onClose: () => void
}

function ApiKeyDialog({
  isOpen,
  onOpenChange,
  step,
  apiKeyForm,
  newApiKey,
  showKey,
  copied,
  onShowKeyChange,
  onCopyKey,
  onClose,
}: ApiKeyDialogProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal isDismissable>
        <Dialog>
          {step === "create" ? (
            <Form
              onSubmit={(e) => {
                e.preventDefault()
                apiKeyForm.handleSubmit()
              }}
            >
              <div className="p-4 flex flex-col gap-y-4">
                <Heading level={2}>Create API Key</Heading>
                <apiKeyForm.AppField
                  name="name"
                  children={(field: any) => (
                    <field.TextField
                      placeholder="e.g., Production API, Development Key"
                      autoFocus
                      isRequired
                    />
                  )}
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    intent="secondary"
                    onPress={() => {
                      onOpenChange(false)
                      apiKeyForm.reset()
                    }}
                    type="button"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    isPending={apiKeyForm.state.isSubmitting}
                    isDisabled={apiKeyForm.state.isSubmitting}
                  >
                    {apiKeyForm.state.isSubmitting ? "Creating..." : "Create API Key"}
                  </Button>
                </div>
              </div>
            </Form>
          ) : (
            <div className="p-6">
              <Heading level={2} className="text-lg font-semibold mb-4">
                API Key Created Successfully
              </Heading>

              <div className="mb-6">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                  <p className="text-sm text-amber-800">
                    <strong>Important:</strong> This is the only time you will be able to see the full API
                    key. Make sure to copy it and store it securely before closing this dialog.
                  </p>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                    <code className="flex-1 font-mono text-sm break-all">
                      {showKey ? newApiKey : `${newApiKey.slice(0, 12)}${"•".repeat(24)}`}
                    </code>
                    <div className="flex gap-1">
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => onShowKeyChange(!showKey)}
                        className="px-2"
                      >
                        {showKey ? <EyeOffRegular className="size-4" /> : <EyeRegular className="size-4" />}
                      </Button>
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => onCopyKey(newApiKey)}
                        className="px-2"
                      >
                        <CopyRegular className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {copied && (
                    <div className="absolute -bottom-6 left-0 text-xs text-green-600">
                      Copied to clipboard!
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onPress={onClose}>Done</Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  )
}

type InviteDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  invitationForm: any
}

function InviteDialog({ isOpen, onOpenChange, invitationForm }: InviteDialogProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal isDismissable>
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault()
              invitationForm.handleSubmit()
            }}
          >
            <div className="p-4 flex flex-col gap-y-4">
              <Heading level={2}>Invite Member</Heading>
              <invitationForm.AppField
                name="email"
                children={(field: any) => (
                  <field.TextField
                    label="Email Address"
                    placeholder="colleague@example.com"
                    autoFocus
                    isRequired
                    type="email"
                  />
                )}
              />
              <invitationForm.AppField
                name="role"
                children={(field: any) => (
                  <div className="flex flex-col gap-y-1">
                    <label className="text-sm font-medium text-gray-900">Role</label>
                    <select
                      className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value as "member" | "admin")}
                      onBlur={field.handleBlur}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
                    )}
                  </div>
                )}
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  intent="secondary"
                  onPress={() => {
                    onOpenChange(false)
                    invitationForm.reset()
                  }}
                  type="button"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  isPending={invitationForm.state.isSubmitting}
                  isDisabled={invitationForm.state.isSubmitting}
                >
                  {invitationForm.state.isSubmitting ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </DialogTrigger>
  )
}
