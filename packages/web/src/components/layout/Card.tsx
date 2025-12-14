import { twMerge } from "tailwind-merge";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={twMerge(
        "bg-surface ring ring-black/2 rounded-lg ml-px size-full grow shadow-surface",
        className
      )}
    >
      {children}
    </div>
  );
}
