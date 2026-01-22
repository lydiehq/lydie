import { useState } from "react"
import { Modal } from "../generic/Modal"
import { Dialog } from "../generic/Dialog"
import { Heading, Button as RACButton } from "react-aria-components"
import { Separator } from "../generic/Separator"
import { Button } from "../generic/Button"
import { useNavigate, useRouteContext } from "@tanstack/react-router"
import { ChevronRightRegular } from "@fluentui/react-icons"
import { useOrganization } from "@/context/organization.context"
import { OrganizationAvatar } from "./OrganizationAvatar"

export function OrganizationsDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) {
  const { organization } = useOrganization()
  const { organizations } = useRouteContext({ from: "/__auth" })

  const navigate = useNavigate()

  const goToOrganization = async (organizationSlug: string) => {
    if (organization?.slug === organizationSlug) {
      return
    }

    navigate({
      to: "/w/$organizationSlug",
      params: { organizationSlug },
    })
    onOpenChange(false)
  }

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
                className="flex flex-col relative after:absolute after:content-[''] after:left-12 after:right-0 after:bottom-0 after:border-b after:border-black/5 last:after:border-b-0 hover:after:border-transparent"
              >
                <RACButton
                  onPress={() => goToOrganization(o.slug || o.id)}
                  isDisabled={organization?.slug === o.slug}
                  className="flex items-center gap-x-2 relative p-1.5 hover:bg-black/5 rounded-md group"
                >
                  <OrganizationAvatar organization={o} size="lg" />
                  <div className="font-medium text-black text-sm">
                    {o.name}
                    {organization?.slug === o.slug && <span className="text-gray-500 ml-1">current</span>}
                  </div>
                  <ChevronRightRegular className="size-[14px] absolute right-2 text-gray-200 top-1/2 -translate-y-1/2 group-hover:text-gray-400" />
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
  )
}
