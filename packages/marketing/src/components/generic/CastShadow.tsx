import { clsx } from "clsx";
import { motion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, type ReactNode } from "react";

interface CastShadowProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Base shadow strength multiplier (0-1)
   * @default 0.2
   */
  strength?: number;
  /**
   * 3D height of the box in pixels
   * Higher Nboxes cast longer and stronger shadows
   * @default 50
   */
  height?: number;
  /**
   * Light source angle in degrees (0-360)
   * 0° = light from right, shadow to left
   * 45° = light from top-right, shadow to bottom-left
   * 90° = light from top, shadow to bottom
   * 135° = light from top-left, shadow to bottom-right
   * 180° = light from left, shadow to right
   * @default 45
   */
  lightAngle?: number;
  /**
   * Border radius of the container as a percentage (0-50)
   * When set, shadow starts at the tangent point on the rounded corner
   * rather than from the sharp corner
   * @default 0
   */
  borderRadius?: number;
  /**
   * RGB color values for the shadow as a comma-separated string
   * @default "0, 0, 0"
   */
  shadowColor?: string;
  /**
   * Whether to animate shadow changes with a slow 2s transition
   * @default false
   */
  animate?: boolean;
}

// Box corners in clockwise order: top-left, top-right, bottom-right, bottom-left
const BOX_CORNERS = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
] as const;

/**
 * Calculate clip-path polygon for the shadow.
 */
export function calculateClipPath(angle: number, borderRadius = 0): string {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const shadowRadians = ((normalizedAngle + 180) * Math.PI) / 180;
  const shadowDx = Math.cos(shadowRadians);
  const shadowDy = -Math.sin(shadowRadians);
  const extendX = shadowDx * 1000;
  const extendY = shadowDy * 1000;
  const perpDx = -shadowDy;
  const perpDy = shadowDx;

  const projections = BOX_CORNERS.map((corner, idx) => ({
    idx,
    perpProj: corner.x * perpDx + corner.y * perpDy,
    shadowProj: corner.x * shadowDx + corner.y * shadowDy,
  }));

  const minPerpProj = Math.min(...projections.map((p) => p.perpProj));
  const maxPerpProj = Math.max(...projections.map((p) => p.perpProj));

  const minPerpCorners = projections.filter((p) => Math.abs(p.perpProj - minPerpProj) < 0.001);
  const c1 = minPerpCorners.reduce((best, curr) =>
    curr.shadowProj > best.shadowProj ? curr : best,
  ).idx;

  const maxPerpCorners = projections.filter((p) => Math.abs(p.perpProj - maxPerpProj) < 0.001);
  const c2 = maxPerpCorners.reduce((best, curr) =>
    curr.shadowProj > best.shadowProj ? curr : best,
  ).idx;

  const clockwiseSteps = (c2 - c1 + 4) % 4;
  const counterSteps = (c1 - c2 + 4) % 4;

  let goClockwise: boolean;
  if (clockwiseSteps !== counterSteps) {
    goClockwise = clockwiseSteps < counterSteps;
  } else {
    const clockwiseMid = (c1 + 1) % 4;
    const counterMid = (c1 - 1 + 4) % 4;
    goClockwise = projections[clockwiseMid].shadowProj > projections[counterMid].shadowProj;
  }

  const polygon: string[] = [];
  const cornerInset = 15;

  const getInsetCorner = (cornerIdx: number) => {
    const corner = BOX_CORNERS[cornerIdx];
    const dx = 50 - corner.x;
    const dy = 50 - corner.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return corner;
    return {
      x: corner.x + (dx / len) * cornerInset,
      y: corner.y + (dy / len) * cornerInset,
    };
  };

  polygon.push(`${BOX_CORNERS[c1].x}% ${BOX_CORNERS[c1].y}%`);

  let curr = c1;
  if (goClockwise) {
    while (curr !== c2) {
      curr = (curr + 1) % 4;
      if (curr === c2) {
        polygon.push(`${BOX_CORNERS[curr].x}% ${BOX_CORNERS[curr].y}%`);
      } else {
        const ext = getInsetCorner(curr);
        polygon.push(`${ext.x}% ${ext.y}%`);
      }
    }
  } else {
    while (curr !== c2) {
      curr = (curr - 1 + 4) % 4;
      if (curr === c2) {
        polygon.push(`${BOX_CORNERS[curr].x}% ${BOX_CORNERS[curr].y}%`);
      } else {
        const ext = getInsetCorner(curr);
        polygon.push(`${ext.x}% ${ext.y}%`);
      }
    }
  }

  polygon.push(`${BOX_CORNERS[c2].x + extendX}% ${BOX_CORNERS[c2].y + extendY}%`);
  polygon.push(`${BOX_CORNERS[c1].x + extendX}% ${BOX_CORNERS[c1].y + extendY}%`);

  return `polygon(${polygon.join(", ")})`;
}

/**
 * Calculate box-shadow offsets based on light angle and height
 */
function calculateShadows(angle: number, height: number, strength: number, shadowColor: string): string {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const shadowAngle = normalizedAngle + 180;
  const radians = (shadowAngle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = -Math.sin(radians);
  const maxOffset = Math.min(height * 2, 200);
  const steps = 9;
  const opacitySteps = [0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.02, 0.01];

  const shadows: string[] = [];

  for (let i = 0; i < steps; i++) {
    const stepOffset = ((i + 1) / steps) * maxOffset;
    const offsetX = dx * stepOffset;
    const offsetY = dy * stepOffset;
    const opacity = opacitySteps[i] * strength;
    shadows.push(`${offsetX}px ${offsetY}px 0 0 rgba(${shadowColor}, ${opacity})`);
  }

  return shadows.join(", ");
}

export function CastShadow({
  children,
  className,
  style,
  strength = 0.2,
  height = 50,
  lightAngle = 135,
  borderRadius = 0,
  shadowColor = "0, 0, 0",
  animate = false,
}: CastShadowProps) {
  // For non-animated mode, just calculate values directly
  const staticStyles = useMemo(() => {
    if (animate) return null;
    return {
      clipPath: calculateClipPath(lightAngle, borderRadius),
      boxShadow: calculateShadows(lightAngle, height, strength, shadowColor),
    };
  }, [animate, lightAngle, height, strength, shadowColor, borderRadius]);

  // For animated mode, create springs with slow duration (~2 seconds)
  const springConfig = { stiffness: 20, damping: 30, mass: 2 };
  const animatedAngle = useSpring(lightAngle, springConfig);
  const animatedHeight = useSpring(height, springConfig);
  const animatedStrength = useSpring(strength, springConfig);

  // Update springs when props change (only when animate is true)
  useEffect(() => {
    if (animate) {
      animatedAngle.set(lightAngle);
    }
  }, [lightAngle, animate, animatedAngle]);

  useEffect(() => {
    if (animate) {
      animatedHeight.set(height);
    }
  }, [height, animate, animatedHeight]);

  useEffect(() => {
    if (animate) {
      animatedStrength.set(strength);
    }
  }, [strength, animate, animatedStrength]);

  // Transform animated values into shadow styles
  const animatedClipPath = useTransform(animatedAngle, (angle) => 
    calculateClipPath(angle, borderRadius)
  );

  const animatedBoxShadow = useTransform(
    [animatedAngle, animatedHeight, animatedStrength],
    (latest) => {
      const [angle, h, s] = latest as [number, number, number];
      return calculateShadows(angle, h, s, shadowColor);
    }
  );

  return (
    <motion.div
      className={clsx("cast-shadow", className)}
      style={{
        "--cast-shadow-border-radius": `${borderRadius}%`,
        "--cast-shadow-color": shadowColor,
        ...style,
      } as React.CSSProperties}
    >
      <motion.div
        className="cast-shadow__layer"
        style={animate ? { 
          clipPath: animatedClipPath,
          boxShadow: animatedBoxShadow,
        } : staticStyles || {}}
      />
      <div className="cast-shadow__content">{children}</div>
    </motion.div>
  );
}
