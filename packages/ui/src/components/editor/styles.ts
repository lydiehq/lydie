import { cva } from "cva";

export const sidebarItemStyles = cva({
  base: "group flex items-center h-[28px] rounded-md text-sm font-medium mb-0.5 [&.active]:bg-black/5 transition-colors duration-75",
  variants: {
    isCurrent: {
      true: "bg-black/5",
      false: "text-gray-600 hover:bg-black/3",
    },
  },
  defaultVariants: {
    isCurrent: false,
  },
});

export const sidebarItemIconStyles = cva({
  base: "icon-muted",
});
