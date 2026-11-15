import { tv } from "tailwind-variants";

export const sidebarItemStyles = tv({
  base: "group flex items-center h-[30px] rounded-lg text-sm font-medium mb-0.5 [&.active]:bg-gray-950/5",
  variants: {
    isCurrent: {
      true: "bg-gray-950/5",
      false: "text-gray-600 hover:bg-gray-950/3",
    },
  },
  defaultVariants: {
    isCurrent: false,
  },
});

// The title over a group of sidebar items ("Documents", "Favorites", a teamspace's name).
export const sidebarSectionTitleClass = "text-xs font-medium text-gray-500";

export const sidebarItemIconStyles = tv({
  base: "icon-muted",
});
