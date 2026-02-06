import { ChevronRightRegular } from "@fluentui/react-icons";
import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Heading, Button as RACButton } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { authClient } from "@/utils/auth";

import { OrganizationAvatar } from "./OrganizationAvatar";

function getPlanName(subscriptionPlan: string | null | undefined): string {
  if (!subscriptionPlan || subscriptionPlan === PLAN_TYPES.FREE) {
    return PLAN_LIMITS[PLAN_TYPES.FREE].name;
  }
  if (subscriptionPlan === PLAN_TYPES.MONTHLY) {
    return PLAN_LIMITS[PLAN_TYPES.MONTHLY].name;
  }
  if (subscriptionPlan === PLAN_TYPES.YEARLY) {
    return PLAN_LIMITS[PLAN_TYPES.YEARLY].name;
  }
  return PLAN_LIMITS[PLAN_TYPES.FREE].name;
}

export function OrganizationsDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { organization } = useOrganization();
  const { organizations } = useRouteContext({ from: "/__auth" });

  const navigate = useNavigate();

  const goToOrganization = (targetOrg: { id: string; slug: string }) => {
    if (organization?.slug === targetOrg.slug) {
      return;
    }

    authClient.organization.setActive({
      organizationId: targetOrg.id,
    });

    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug: targetOrg.slug },
    });

    onOpenChange(false);
  };

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
        <Dialog>
          <div className="p-3">
            <Heading slot="title" className="text-sm font-medium text-gray-700">
              My workspaces
            </Heading>
          </div>
          <Separator />
          <ul className="p-3">
            {organizations?.map((o) => (
              <li
                key={o.id}
                className="flex flex-col relative after:absolute after:content-[''] after:left-12 after:right-2 after:bottom-0 after:border-b after:border-black/5 last:after:border-b-0 hover:after:border-transparent"
              >
                <RACButton
                  onPress={() => goToOrganization(o)}
                  isDisabled={organization?.slug === o.slug}
                  className="flex items-center gap-x-2 relative p-1.5 hover:bg-black/5 rounded-xl group w-full text-left"
                >
                  <OrganizationAvatar organization={o} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-black text-sm truncate">
                      {o.name}
                      {organization?.slug === o.slug && (
                        <span className="text-gray-500 ml-1">current</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {getPlanName(o.subscriptionPlan)}
                    </div>
                  </div>
                  <ChevronRightRegular className="size-[14px] text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                </RACButton>
              </li>
            ))}
          </ul>
          <Separator />
          <div className="flex justify-end p-3">
            <Button size="sm" href="/new">
              Create workspace
            </Button>
          </div>
        </Dialog>
      </Modal>
    </>
  );
}
