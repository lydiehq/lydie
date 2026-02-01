import { COLORS } from "@lydie/core/colors";
import { type VariantProps, cva } from "cva";

const avatarStyles = cva({
  base: [
    "border border-black/10 shadow-[0_1px_theme(colors.white/0.15)_inset,0_1px_3px_theme(colors.black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-gradient-to-b after:from-white/14 text-white flex items-center justify-center font-medium relative [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]",
  ].join(" "),
  variants: {
    size: {
      sm: "size-5 text-[10px] rounded",
      md: "size-6 text-[11px] rounded-md",
      lg: "size-7 text-xs rounded-md",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type UserAvatarProps = VariantProps<typeof avatarStyles> & {
  className?: string;
  user?: { name?: string | null; email?: string | null } | null;
};

// Generate a consistent color based on a seed string
function getColorFromSeed(seed: string): string {
  if (!seed) return COLORS[0].value;

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const index = Math.abs(hash) % COLORS.length;
  return COLORS[index].value;
}

export function UserAvatar({
  size,
  className,
  user,
}: UserAvatarProps) {
  // Generate a consistent color based on user's name or email
  const seed = user?.name || user?.email || "";
  const color = getColorFromSeed(seed);

  // Get initials from name or email
  const getInitials = () => {
    if (user?.name) {
      const parts = user.name.split(" ").filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return user.name.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "?";
  };

  return (
    <div
      className={avatarStyles({ size, className })}
      style={{
        backgroundColor: color,
      }}
      aria-hidden="true"
    >
      {getInitials()}
    </div>
  );
}
