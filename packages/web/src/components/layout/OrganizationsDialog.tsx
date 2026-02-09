import { ChevronRightRegular } from "@fluentui/react-icons";
import { getDefaultColorForId } from "@lydie/core/colors";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { queries } from "@lydie/zero/queries";
import { type QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { Heading, Button as RACButton } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { authClient } from "@/utils/auth";

import { OrganizationAvatar } from "./OrganizationAvatar";

type Organization = QueryResultType<typeof queries.organizations.byUser>[number]["organization"];

export function OrganizationsDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { organization } = useOrganization();
  const navigate = useNavigate();

  // Use Zero to get all organizations for the current user
  const [memberships] = useQuery(queries.organizations.byUser({}));
  const organizations = memberships?.map((m) => m.organization) ?? [];

  const goToOrganization = (targetOrg: Organization) => {
    if (!targetOrg || organization?.slug === targetOrg.slug) {
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
            {organizations?.map((o) => {
              if (!o) return null;
              return (
                <li
                  key={o.id}
                  className="flex flex-col relative after:absolute after:content-[''] after:left-12 after:right-2 after:bottom-0 after:border-b after:border-black/5 last:after:border-b-0 hover:after:border-transparent"
                >
                  <RACButton
                    onPress={() => goToOrganization(o)}
                    isDisabled={organization?.slug === o.slug}
                    className="flex items-center gap-x-2 relative p-1.5 hover:bg-black/5 rounded-xl group"
                  >
                    <OrganizationAvatar
                      name={o.name}
                      color={o.color ?? getDefaultColorForId(o.id)}
                      size="lg"
                    />
                    <div className="font-medium text-black text-sm">
                      {o.name}
                      {organization?.slug === o.slug && (
                        <span className="text-gray-500 ml-1">current</span>
                      )}
                    </div>
                    <ChevronRightRegular className="size-[14px] absolute right-2 text-gray-200 top-1/2 -translate-y-1/2 group-hover:text-gray-400" />
                  </RACButton>
                </li>
              );
            })}
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
