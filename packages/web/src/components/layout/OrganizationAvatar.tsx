import { type VariantProps, cva } from "cva";

const avatarStyles = cva({
  base: [
    "border border-black/10 shadow-[0_1px_theme(colors.white/0.15)_inset,0_1px_3px_theme(colors.black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-gradient-to-b after:from-white/14 text-white flex items-center justify-center font-bold uppercase relative [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]",
  ].join(" "),
  variants: {
    size: {
      sm: "size-6 text-[12px] rounded-md",
      md: "size-7 text-[14px] rounded-lg",
      lg: "size-8 text-sm rounded-lg",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type OrganizationAvatarProps = VariantProps<typeof avatarStyles> & {
  className?: string;
  name?: string | null;
  color: string;
};

export function OrganizationAvatar({ size, className, name, color }: OrganizationAvatarProps) {
  return (
    <div
      className={avatarStyles({ size, className })}
      style={{
        backgroundColor: color,
      }}
      aria-hidden="true"
    >
      {name?.slice(0, 1).toUpperCase() ?? ""}
    </div>
  );
}
