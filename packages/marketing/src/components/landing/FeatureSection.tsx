import { ChevronRightRegular } from "@fluentui/react-icons";

import type { DemoState } from "./DemoStateSelector";

import { Button } from "../generic/Button";
import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { FeatureSpot } from "./feature-spots";

export interface FeatureSectionProps {
  illustration: DemoState;
  title: string;
  content: string;
  featureSlug: string;
  reverse?: boolean;
}

export function FeatureSection({
  illustration,
  title,
  content,
  featureSlug,
  reverse = false,
}: FeatureSectionProps) {
  const featureUrl = `/features/${featureSlug}`;

  return (
    <div className="relative max-w-4xl mx-auto">
      <GradientOutline />
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-8 items-center ${
          reverse ? "md:[direction:rtl]" : ""
        }`}
      >
        <CastShadow className="w-full" strength={0.2}>
          <div className="flex flex-col h-[400px] rounded-xl shadow-legit bg-white overflow-hidden relative border border-black/5 [direction:ltr]">
            <FeatureSpot type={illustration} className="h-full rounded-none" />
          </div>
        </CastShadow>
        <div
          className={`flex flex-col gap-y-4 ${reverse ? "md:[direction:ltr] md:pl-4" : "md:pr-4"}`}
        >
          <h2 className="text-3xl tracking-tight font-medium text-black/85">{title}</h2>
          <p className="text-base/relaxed text-black/60 text-balance">{content}</p>
          <div className="flex items-center gap-1 mt-4">
            <Button href="https://app.lydie.co/auth" size="md" intent="primary">
              <span>Try it yourself</span>
              <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
            </Button>
            <Button href={featureUrl} size="md" intent="ghost">
              Learn more
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
