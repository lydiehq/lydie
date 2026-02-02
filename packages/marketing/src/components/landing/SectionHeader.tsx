import type { ReactNode } from "react";

import { clsx } from "clsx";

import { Eyebrow } from "./Eyebrow";

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  centered?: boolean;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  centered = false,
  className,
}: Props) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-y-2",
        centered && "items-center text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-3xl tracking-tight font-medium text-black/85">{title}</h2>
      {description && (
        <p className="text-base/relaxed text-black/60 max-w-xl text-balance">{description}</p>
      )}
    </div>
  );
}
