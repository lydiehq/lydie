import { MenuItem, MenuItemLink, MenuSeparator } from "@/components/generic/Menu"
import { useOrganization } from "@/context/organization.context"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { Button as RACButton, MenuTrigger, Menu } from "react-aria-components"
import { useState } from "react"
import { OrganizationsDialog } from "./OrganizationsDialog"
import clsx from "clsx"
import { authClient } from "@/utils/auth"
import { useQueryClient } from "@tanstack/react-query"
import { composeTailwindRenderProps, focusRing } from "../generic/utils"
import { Popover } from "../generic/Popover"
import { OrganizationAvatar } from "./OrganizationAvatar"
import { ChevronDown12Regular, ChevronUpDownRegular } from "@fluentui/react-icons"
import { useAuth } from "@/context/auth.context"
import { clearSession } from "@/lib/auth/session"
import { clearZeroInstance } from "@/lib/zero/instance"

type Props = {
  isCollapsed: boolean
}

export function OrganizationMenu({ isCollapsed }: Props) {
  const { organization } = useOrganization()
  const { session } = useAuth()
  const userId = session?.userId
  const queryClient = useQueryClient()
  const [isOrganizationDialogOpen, setIsOrganizationDialogOpen] = useState(false)

  const signOut = async () => {
    await authClient.signOut()
    await clearSession(queryClient)
    clearZeroInstance()
    window.location.href = "https://lydie.co"
  }

  return (
    <div>
      <MenuTrigger>
        <RACButton
          className={composeTailwindRenderProps(
            focusRing,
            clsx(
              "flex justify-between items-center gap-x-2 hover:bg-black/3 rounded-md overflow-hidden aria-expanded:bg-black/3",
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
              <ChevronDown12Regular className="size-3 text-gray-500" />
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
                {organization?.subscriptionPlan === "free" ? "Free Plan" : "Pro Plan"}
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
      <OrganizationsDialog isOpen={isOrganizationDialogOpen} onOpenChange={setIsOrganizationDialogOpen} />
    </div>
  )
}
