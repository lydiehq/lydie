import { MenuItem, MenuSeparator } from "@lydie/ui/components/generic/Menu";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { composeTailwindRenderProps, focusRing } from "@lydie/ui/components/generic/utils";
import { CollapseArrow } from "@lydie/ui/components/icons/CollapseArrow";
import { useQueryClient } from "@tanstack/react-query";
import { createLink } from "@tanstack/react-router";
import clsx from "clsx";
import { useState } from "react";
import { Menu, MenuTrigger, Button as RACButton } from "react-aria-components";

import { PLAN_LIMITS, PLAN_TYPES } from "@lydie/database/billing-types";

import { useOrganization } from "@/context/organization.context";
import { clearSession } from "@/lib/auth/session";
import { resetUser } from "@/lib/posthog";
import { clearZeroInstance } from "@/lib/zero/instance";
import { authClient } from "@/utils/auth";

import { OrganizationAvatar } from "./OrganizationAvatar";
import { OrganizationsDialog } from "./OrganizationsDialog";

const MenuItemLink = createLink(MenuItem);

type Props = {
  isCollapsed: boolean;
};

export function OrganizationMenu({ isCollapsed }: Props) {
  const { organization } = useOrganization();

  const queryClient = useQueryClient();
  const [isOrganizationDialogOpen, setIsOrganizationDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const signOut = async () => {
    await authClient.signOut();
    await clearSession(queryClient);
    clearZeroInstance();
    resetUser();
    window.location.href = import.meta.env.DEV ? "http://localhost:3000" : "https://lydie.co";
  };

  return (
    <div>
      <MenuTrigger isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <RACButton
          className={composeTailwindRenderProps(
            focusRing,
            clsx(
              "group flex justify-between items-center gap-x-2 hover:bg-black/3 rounded-lg overflow-hidden aria-expanded:bg-black/3",
              !isCollapsed && "px-1.5 py-0.5 -mx-1.5",
            ),
          )}
        >
          <OrganizationAvatar size="md" />
          {!isCollapsed && (
            <>
              <div className="font-medium text-gray-700 text-sm whitespace-nowrap truncate">
                {organization?.name}
              </div>
              <CollapseArrow
                className={`size-3 text-gray-500 ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity rotate-90`}
              />
            </>
          )}
        </RACButton>
        <Popover placement="bottom start" className="min-w-[220px]">
          <div className="flex items-center gap-x-2 px-2 pt-2">
            <OrganizationAvatar size="md" />
            <div className="flex flex-col">
              <div className="font-medium text-gray-700 text-sm whitespace-nowrap truncate">
                {organization?.name}
              </div>
              <div className="text-xs text-gray-500">
                {!organization?.subscriptionPlan || organization.subscriptionPlan === PLAN_TYPES.FREE
                  ? PLAN_LIMITS[PLAN_TYPES.FREE].name
                  : organization.subscriptionPlan === PLAN_TYPES.MONTHLY
                    ? PLAN_LIMITS[PLAN_TYPES.MONTHLY].name
                    : organization.subscriptionPlan === PLAN_TYPES.YEARLY
                      ? PLAN_LIMITS[PLAN_TYPES.YEARLY].name
                      : PLAN_LIMITS[PLAN_TYPES.FREE].name}
              </div>
            </div>
          </div>
          <Menu className="outline-none max-h-[inherit] overflow-auto p-1 w-full">
            <MenuSeparator />
            <MenuItemLink to="/w/$organizationSlug/settings/user" from="/w/$organizationSlug">
              Settings
            </MenuItemLink>
            <MenuSeparator />
            <MenuItem onAction={() => setIsOrganizationDialogOpen(true)}>Switch workspace</MenuItem>
            <MenuItem onAction={signOut}>Sign out</MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      <OrganizationsDialog
        isOpen={isOrganizationDialogOpen}
        onOpenChange={setIsOrganizationDialogOpen}
      />
    </div>
  );
}
