import { Heading } from "./Heading";
import type { ReactNode } from "react";

type SectionHeaderProps = {
  heading: ReactNode;
  description: ReactNode;
  level?: 1 | 2 | 3 | 4;
  descriptionClassName?: string;
};

export function SectionHeader({
  heading,
  description,
  level = 2,
  descriptionClassName = "text-sm/relaxed text-gray-600",
}: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-y-0.5">
      <Heading level={level}>{heading}</Heading>
      <p className={descriptionClassName}>{description}</p>
    </div>
  );
}

