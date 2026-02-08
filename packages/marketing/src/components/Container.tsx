import { twMerge } from "tailwind-merge";

const sizeClasses: Record<string, string> = {
  sm: "max-w-3xl",
  xl: "max-w-xl",
  default: "max-w-232",
};

type Props = {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "xl";
};

export function Container({ children, className, size }: Props) {
  const maxWidth = size ? sizeClasses[size] : sizeClasses.default;
  return (
    <div className={twMerge(maxWidth, "mx-auto lg:px-0 px-4 w-full", className)}>{children}</div>
  );
}
