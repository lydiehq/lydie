import { cva, type VariantProps } from "cva"
import { useOrganization } from "@/context/organization.context"

const avatarStyles = cva({
	base: [
		"bg-linear-to-br from-lime-400 to-lime-500 text-white flex items-center justify-center font-bold uppercase",
	].join(" "),
	variants: {
		size: {
			small: "size-5 text-[12px] rounded-md",
			md: "size-7 text-[14px] rounded-lg",
			lg: "size-8 text-sm",
		},
	},
	defaultVariants: {
		size: "small",
	},
})

type OrganizationAvatarProps = VariantProps<typeof avatarStyles> & {
	className?: string
	organization?: { name?: string | null } | null
}

export function OrganizationAvatar({
	size,
	className,
	organization: organizationProp,
}: OrganizationAvatarProps) {
	const { organization: organizationFromContext } = useOrganization()
	const organization = organizationProp ?? organizationFromContext

	return (
		<div className={avatarStyles({ size, className })} aria-hidden="true">
			{organization?.name?.slice(0, 1).toUpperCase() || ""}
		</div>
	)
}
