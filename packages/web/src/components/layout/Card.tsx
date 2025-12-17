import { cva } from "cva";
import { twMerge } from "tailwind-merge";

export const cardStyles = cva({
  base: "bg-surface ring ring-black/6 rounded-lg",
  variants: {},
});

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={twMerge(cardStyles({ className }))}>{children}</div>;
}
