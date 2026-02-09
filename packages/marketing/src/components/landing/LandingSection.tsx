import { ChevronRightRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";

import { Button } from "../generic/Button";
import { FeatureBadge } from "./FeatureBadge";

type ButtonConfig = {
  href: string;
  label: string;
  showArrow?: boolean;
};

type LandingSectionProps = {
  title: ReactNode;
  description: string;
  illustration: ReactNode;
  primaryButton: ButtonConfig;
  secondaryButton?: ButtonConfig;
  featureBadge?: string;
  reverse?: boolean;
};

export function LandingSection({
  title,
  description,
  illustration,
  primaryButton,
  secondaryButton,
  featureBadge,
  reverse = false,
}: LandingSectionProps) {
  const textContent = (
    <div className="flex flex-col gap-y-4 justify-center px-4 sm:px-0 size-full">
      {featureBadge && <FeatureBadge feature={featureBadge} />}
      <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-black/85">{title}</h2>
      <p className="text-base/relaxed text-black/60 text-balance">{description}</p>
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
      <div
        className={`grid grid-cols-1 md:grid-cols-2 z-0 gap-8 items-center ${
          reverse ? "md:[direction:rtl]" : ""
        }`}
      >
        <div className={`relative flex size-full ${reverse ? "md:[direction:ltr]" : ""}`}>
          {illustration}
        </div>
        <div className={reverse ? "md:[direction:ltr] md:pl-4" : "md:pr-4"}>{textContent}</div>
      </div>
    </div>
  );
}
