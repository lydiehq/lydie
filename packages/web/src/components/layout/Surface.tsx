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
      className={twMerge(
        "bg-surface rounded-l-lg rounded-r-md size-full grow shadow-container",
        className,
      )}
    >
      {children}
    </div>
  );
}
