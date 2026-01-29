import { ErrorCircleRegular } from "@fluentui/react-icons";
import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { DialogTrigger, Form } from "react-aria-components";

type InviteDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  invitationForm: any;
  organization?: {
    subscriptionPlan?: string | null;
    subscriptionStatus?: string | null;
    paidSeats?: number;
  };
};

export function InviteDialog({
  isOpen,
  onOpenChange,
  invitationForm,
  organization,
}: InviteDialogProps) {
  // Determine if this is a paid workspace
  const isPaidWorkspace =
    organization?.subscriptionStatus === "active" &&
    (organization?.subscriptionPlan === "monthly" || organization?.subscriptionPlan === "yearly");

  const currentPlanType = isPaidWorkspace
    ? organization?.subscriptionPlan === "yearly"
      ? PLAN_TYPES.YEARLY
      : PLAN_TYPES.MONTHLY
    : PLAN_TYPES.FREE;

  const pricePerSeat = isPaidWorkspace ? PLAN_LIMITS[currentPlanType].price : 0;
  const currentSeats = organization?.paidSeats || 0;
  const newTotal = isPaidWorkspace ? (currentSeats + 1) * pricePerSeat : 0;

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal isDismissable>
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              invitationForm.handleSubmit();
            }}
          >
            <div className="p-4 flex flex-col gap-y-4">
              <Heading level={2}>Invite Member</Heading>

              {/* Billing Warning for Paid Workspaces */}
              {isPaidWorkspace && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <ErrorCircleRegular className="size-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900">Adding this member will:</p>
                      <ul className="mt-1 text-amber-800 space-y-0.5 list-disc list-inside">
                        <li>Add 1 seat to your workspace</li>
                        <li>Increase your monthly bill by ${pricePerSeat}</li>
                        <li>
                          New total: {currentSeats + 1} seats × ${pricePerSeat} = $
                          {newTotal.toFixed(2)}
                          /month
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              <invitationForm.AppField
                name="email"
                children={(field: any) => (
                  <field.TextField
                    label="Email Address"
                    placeholder="colleague@example.com"
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
                    onOpenChange(false);
                    invitationForm.reset();
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
  );
}
