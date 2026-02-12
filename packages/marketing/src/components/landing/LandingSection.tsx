import type { ReactNode } from "react";

import { ChevronRightRegular } from "@fluentui/react-icons";

import { Button } from "../generic/Button";
import { FeatureBadge } from "./FeatureIcon";
import { SectionHeader } from "./SectionHeader";

type ButtonConfig = {
  href: string;
  label: string;
  showArrow?: boolean;
};

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

type FeatureBadgeConfig = {
  icon: "assistant" | "linking" | "collaboration" | "search" | "speed";
  color: ColorId;
  text: string;
};

type LandingSectionProps = {
  title: string;
  description: string;
  illustration: ReactNode;
  primaryButton: ButtonConfig;
  secondaryButton?: ButtonConfig;
  featureBadge?: FeatureBadgeConfig;
  reverse?: boolean;
};

export function LandingSection({
  title,
  description,
  illustration,
  primaryButton,
  secondaryButton,
  featureBadge,
  reverse = true,
}: LandingSectionProps) {
  const textContent = (
    <div className="flex flex-col gap-y-4 justify-center size-full">
      {featureBadge && (
        <FeatureBadge
          icon={featureBadge.icon}
          color={featureBadge.color}
          text={featureBadge.text}
        />
      )}
      <SectionHeader title={title} description={description} />
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mt-4">
        <Button href={primaryButton.href} size="md" intent="primary">
          <span>{primaryButton.label}</span>
          {primaryButton.showArrow && (
            <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
          )}
        </Button>
        {secondaryButton && (
          <Button href={secondaryButton.href} size="md" intent="ghost">
            {secondaryButton.label}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative bg-white z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 z-0 gap-8 items-center">
        <div className={`relative flex size-full order-2 ${reverse ? "md:order-2" : "md:order-1"}`}>
          {illustration}
        </div>
        <div className={`order-1 ${reverse ? "md:order-1" : "md:order-2"}`}>{textContent}</div>
      </div>
    </div>
  );
}
