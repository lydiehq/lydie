import { DialogTrigger, Form } from "react-aria-components"
import { Modal } from "@/components/generic/Modal"
import { Dialog } from "@/components/generic/Dialog"
import { Heading } from "@/components/generic/Heading"
import { Button } from "@/components/generic/Button"

type InviteDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  invitationForm: any
}

export function InviteDialog({ isOpen, onOpenChange, invitationForm }: InviteDialogProps) {
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
