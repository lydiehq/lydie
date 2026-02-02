import { clsx } from "clsx";

import { Heading } from "../generic/Heading";
import { Eyebrow } from "./Eyebrow";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
  className?: string;
};

export function SectionHeader({ eyebrow, title, description, centered, className }: Props) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-y-2 max-w-lg",
        centered && "items-center text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading level={2}>{title}</Heading>
      {description && <p className="text-base/relaxed text-black/60 text-balance">{description}</p>}
    </div>
  );
}
