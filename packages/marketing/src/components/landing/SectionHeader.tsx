import { clsx } from "clsx";

import { Heading } from "../generic/Heading";
import { Eyebrow } from "./Eyebrow";
import { FeatureBadge } from "./FeatureIcon";

type ColorId =
  | "coral"
  | "purple"
  | "blue"
  | "mint"
  | "gold"
  | "pink"
  | "periwinkle"
  | "green"
  | "peach"
  | "violet"
  | "cyan"
  | "rose";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
  className?: string;
  level?: 1 | 2 | 3 | 4;
  feature?: {
    icon: "assistant" | "linking" | "collaboration" | "search" | "speed";
    color: ColorId;
    text: string;
  };
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  centered,
  className,
  feature,
  level = 2,
}: Props) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-y-2 max-w-lg",
        centered && "items-center text-center",
        className,
      )}
    >
      {feature && <FeatureBadge icon={feature.icon} color={feature.color} text={feature.text} />}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading level={level}>{title}</Heading>
      {description && <p className="text-base/relaxed text-black/60 text-balance">{description}</p>}
    </div>
  );
}
