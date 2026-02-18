import { motion } from "motion/react";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { LandingSection } from "./LandingSection";

const BAR_COUNT = 25;
const MAX_HEIGHT = 280;

function SoundWaveBars() {
  // Generate bars with upward exponential curve
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const normalized = i / (BAR_COUNT - 1);
    // Exponential curve: starts lower, goes up up up
    const height = MAX_HEIGHT * Math.pow(normalized, 1.5);
    return { id: i, height };
  });

  return (
    <div className="flex items-end justify-center gap-1 h-full px-8 py-12 size-full">
      {bars.map((bar, index) => (
        <motion.div
          key={bar.id}
          className="w-2 bg-[#9bceb2] rounded-full will-change-transform"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: bar.height, opacity: 1 }}
          transition={{
            height: {
              duration: 0.6,
              delay: index * 0.05,
              ease: [0.25, 0.46, 0.45, 0.94],
            },
            opacity: {
              duration: 0.3,
              delay: index * 0.05,
            },
          }}
        />
      ))}
    </div>
  );
}

export function SpeedSection() {
  const illustration = (
    <div className="relative w-full">
      <div className="size-full absolute bottom-full mb-4 ring ring-black/3 bg-linear-to-t from-black/2 rounded-xl"></div>
      <div className="size-full absolute left-full ml-4 ring ring-black/3 bg-black/2 rounded-xl"></div>
      <div className="w-[200%] h-full absolute right-full mr-4 ring ring-black/3 bg-black/2 rounded-xl"></div>
      <CastShadow className="w-full">
        <GradientOutline />
        <div className="h-[380px] rounded-xl shadow-legit overflow-hidden bg-white">
          <SoundWaveBars />
        </div>
      </CastShadow>
    </div>
  );

  return (
    <LandingSection
      featureBadge={{
        icon: "speed",
        color: "green",
        text: "Speed",
      }}
      title="Don't lose your thoughts to loading screens"
      description="While other tools leave you waiting, Lydie's infrastructure keeps navigation and actions near-instant."
      illustration={illustration}
      primaryButton={{
        href: "https://app.lydie.co/auth",
        label: "Try it yourself",
        showArrow: true,
      }}
      secondaryButton={{
        href: "/features",
        label: "Learn more",
      }}
    />
  );
}
