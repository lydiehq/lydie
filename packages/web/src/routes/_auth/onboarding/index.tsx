import { createFileRoute } from "@tanstack/react-router";
import { Form } from "react-aria-components";
import { useAppForm } from "@/hooks/use-app-form";
import { Button } from "@/components/generic/Button";
import { Heading } from "@/components/generic/Heading";
import { useZero } from "@/services/zero";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { createId } from "@lydie/core/id";
import { toast } from "sonner";
import { slugify } from "@lydie/core/utils";
import { useQueryClient } from "@tanstack/react-query";
import { revalidateSession } from "@/lib/auth/session";
import { mutators } from "@lydie/zero/mutators";
import { useState, useEffect } from "react";
import { TransferModal } from "@/components/trial/TransferModal";
import { hasTrialData, getTrialData } from "@/utils/trial-transfer";
import type { TrialData } from "@/utils/trial-transfer";

export const Route = createFileRoute("/_auth/onboarding/")({
  component: RouteComponent,
});

function RouteComponent() {
  const z = useZero();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newOrganizationId, setNewOrganizationId] = useState<string | null>(null);
  const [cachedTrialData, setCachedTrialData] = useState<TrialData | null>(null);

  // Check for trial data on component mount and cache it
  useEffect(() => {
    const checkTrialData = async () => {
      try {
        // Check if there's a trial user ID
        const trialUserId = localStorage.getItem("lydie:trial-user-id");
        if (!trialUserId) return;

        // Check if there's any trial data
        const hasTrial = await hasTrialData(z);
        if (hasTrial) {
          // Cache the trial data before the user creates an org
          const data = await getTrialData(z);
          setCachedTrialData(data);
        }
      } catch (error) {
        console.error("Failed to check trial data:", error);
      }
    };

    checkTrialData();
  }, [z]);

  const form = useAppForm({
    defaultValues: {
      workspaceName: "",
    },
    onSubmit: async (values) => {
      try {
        const id = createId();
        const slug = slugify(values.value.workspaceName);

        const write = z.mutate(
          mutators.organization.create({
            id,
            name: values.value.workspaceName,
            slug,
          })
        );

        // Wait for the server to exist in the database.
        await write.server;

        await revalidateSession(queryClient);
        await router.invalidate();

        // Check if we have cached trial data to transfer
        if (cachedTrialData && (cachedTrialData.documents.length > 0 || cachedTrialData.folders.length > 0)) {
          setNewOrganizationId(id);
          setShowTransferModal(true);
        } else {
          // No trial data, just navigate to the new workspace
          navigate({
            to: "/w/$organizationId",
            params: { organizationId: id },
          });
          toast.success("Workspace created successfully");
        }
      } catch (error) {
        console.error("Failed to create workspace:", error);
        toast.error("Failed to create workspace");
      }
    },
  });

  const handleTransferComplete = () => {
    if (newOrganizationId) {
      navigate({
        to: "/w/$organizationId",
        params: { organizationId: newOrganizationId },
      });
      toast.success("Workspace created successfully");
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm">
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex flex-col gap-y-8"
          >
            <div className="gap-y-2 flex flex-col">
              <Heading>Welcome to Lydie</Heading>
              <p className="text-gray-600">Let's create your workspace</p>
            </div>

            <div className="gap-y-4 flex flex-col">
              <form.AppField
                name="workspaceName"
                children={(field) => (
                  <field.TextField
                    autoFocus
                    label="Workspace Name"
                    placeholder="My Workspace"
                    description="This will be the name of your organization"
                  />
                )}
              />

              <Button
                type="submit"
                isPending={form.state.isSubmitting}
                className="w-full"
              >
                {form.state.isSubmitting
                  ? "Creating workspace..."
                  : "Create Workspace"}
              </Button>
            </div>
          </Form>
        </div>
      </div>

      {/* Transfer Modal - shows after org creation if trial data exists */}
      {showTransferModal && newOrganizationId && cachedTrialData && (
        <TransferModal
          isOpen={showTransferModal}
          onOpenChange={setShowTransferModal}
          trialZero={z}
          authZero={z}
          targetOrganizationId={newOrganizationId}
          onTransferComplete={handleTransferComplete}
        />
      )}
    </>
  );
}
