import { useId } from "react";
import { clsx } from "clsx";
import "@/styles/grainy-gradient.css";

interface GrainyGradientBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  withInnerShadow?: boolean;
}

export function GrainyGradientBackground({
  children,
  className = "",
  withInnerShadow = false,
}: GrainyGradientBackgroundProps) {
  const filterId = useId();

  return (
    <div
      className={clsx(
        "grainy-gradient-container",
        withInnerShadow && "custom-inner-shadow",
        className
      )}
    >
      <svg className="grainy-gradient-svg">
        <filter id={filterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
      </svg>
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
}
