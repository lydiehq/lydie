import { twMerge } from "tailwind-merge";

export function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={twMerge("bg-surface rounded-lg ml-px size-full grow shadow-surface", className)}
    >
      {children}
    </div>
  );
}
