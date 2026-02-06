import { ArrowClockwiseRegular, ChevronRightRegular, DocumentRegular } from "@fluentui/react-icons";
import { getDefaultColorForId } from "@lydie/core/colors";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { type QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { Heading, Button as RACButton } from "react-aria-components";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { setActiveOrganizationAndNavigate } from "@/lib/organization/setActiveAndNavigate";
import { useZero } from "@/services/zero";

import { OrganizationAvatar } from "../layout/OrganizationAvatar";

type Organization = QueryResultType<typeof queries.organizations.byUser>[number]["organization"];

export function InstallTemplateDialog({
  isOpen,
  onOpenChange,
  templateSlug,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  templateSlug: string;
}) {
  const { organization } = useOrganization();
  const [memberships] = useQuery(queries.organizations.byUser({}));
  const organizations = memberships?.map((m) => m.organization) ?? [];
  const navigate = useNavigate();
  const z = useZero();
  const [installing, setInstalling] = useState<string | null>(null);

  const handleInstall = async (targetOrg: Organization) => {
    if (!targetOrg) return;
    setInstalling(targetOrg.id);

    try {
      if (organization?.id !== targetOrg.id) {
        await setActiveOrganizationAndNavigate(targetOrg.id, navigate, {
          to: "/w/$organizationSlug",
          params: { organizationSlug: targetOrg.slug },
          search: { installTemplate: templateSlug },
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const result = z.mutate(
        mutators.template.install({
          templateSlug,
          organizationId: targetOrg.id,
        }),
      );

      if (result?.server) {
        await result.server;
      }

      // Wait for client-side sync
      if (result?.client) {
        await result.client;
      }

      toast.success("Template installed successfully!");

      onOpenChange(false);
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug: targetOrg.slug },
        search: { installTemplate: undefined },
        replace: true,
      });
    } catch (error: any) {
      console.error("Failed to install template:", error);

      let errorMessage = "Failed to install template. Please try again.";

      if (error?.message) {
        if (error.message.includes("Template not found")) {
          errorMessage = `Template "${templateSlug}" not found. It may not be available yet.`;
        } else if (error.message.includes("already installed")) {
          errorMessage = "This template is already installed in your workspace.";
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
      setInstalling(null);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
        <Dialog>
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-x-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-blue-500 text-white">
                <DocumentRegular className="size-5" />
              </div>
              <div className="flex-1">
                <Heading slot="title" className="text-base font-semibold text-gray-900">
                  Install Template
                </Heading>
                <p className="text-sm text-gray-600 mt-0.5">
                  Choose a workspace to install this template
                </p>
              </div>
            </div>
          </div>
          <div className="p-3 max-h-96 overflow-y-auto">
            <ul className="space-y-2">
              {organizations?.map((o) => {
                if (!o) return null;
                const isInstalling = installing === o.id;
                const isCurrent = organization?.slug === o.slug;

                return (
                  <li key={o.id}>
                    <RACButton
                      onPress={() => handleInstall(o)}
                      isDisabled={installing !== null}
                      className={`
                        w-full flex items-center gap-x-3 p-3 rounded-lg border transition-all
                        ${
                          isInstalling
                            ? "border-blue-300 bg-blue-50"
                            : isCurrent
                              ? "border-gray-200 bg-gray-50 hover:bg-gray-100"
                              : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300"
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      <OrganizationAvatar
                        name={o.name}
                        color={o.color ?? getDefaultColorForId(o.id)}
                        size="lg"
                      />
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-x-2">
                          <div className="font-medium text-gray-900 text-sm truncate">{o.name}</div>
                          {isCurrent && (
                            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        {isInstalling && (
                          <div className="flex items-center gap-x-2 mt-1">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            >
                              <ArrowClockwiseRegular className="size-3 text-blue-600" />
                            </motion.div>
                            <span className="text-xs text-blue-600 font-medium">
                              Installing template...
                            </span>
                          </div>
                        )}
                      </div>
                      {!isInstalling && (
                        <ChevronRightRegular className="size-4 text-gray-400 shrink-0" />
                      )}
                    </RACButton>
                  </li>
                );
              })}
            </ul>
          </div>
          <Separator />
        </Dialog>
      </Modal>
    </>
  );
}
