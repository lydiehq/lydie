import { clsx } from "clsx";
import { type CSSProperties, type ReactNode } from "react";

interface CastShadowProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
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
 *
 * Algorithm:
 * 1. Find the shadow direction (opposite to light)
 * 2. Project each corner onto a line PERPENDICULAR to the shadow direction
 * 3. The two corners with min/max perpendicular projections form the "silhouette"
 * 4. Traverse from one silhouette corner to the other via the SHORTER path
 *    (which passes through corners more in the shadow direction)
 * 5. Extend outward in the shadow direction to complete the polygon
 * 6. For rounded corners, adjust silhouette points to the tangent on the arc
 */
export function calculateClipPath(angle: number, borderRadius = 0): string {
  // Normalize angle to 0-360
  const normalizedAngle = ((angle % 360) + 360) % 360;

  // Shadow extends opposite to light direction
  const shadowRadians = ((normalizedAngle + 180) * Math.PI) / 180;
  const shadowDx = Math.cos(shadowRadians);
  const shadowDy = -Math.sin(shadowRadians); // Negate for CSS Y-down

  // Extend factor for shadow length (large value to cover any shadow offset)
  const extendX = shadowDx * 1000;
  const extendY = shadowDy * 1000;

  // Perpendicular to shadow direction (90° counterclockwise rotation)
  const perpDx = -shadowDy;
  const perpDy = shadowDx;

  // Project each corner onto both directions
  const projections = BOX_CORNERS.map((corner, idx) => ({
    idx,
    perpProj: corner.x * perpDx + corner.y * perpDy,
    shadowProj: corner.x * shadowDx + corner.y * shadowDy,
  }));

  // Find corners with min and max perpendicular projection
  // These form the silhouette (outermost edges of the shadow)
  const minPerpProj = Math.min(...projections.map((p) => p.perpProj));
  const maxPerpProj = Math.max(...projections.map((p) => p.perpProj));

  // Among corners with min perp projection, pick the one with highest shadow projection
  // (most forward in shadow direction - this handles ties at cardinal angles)
  const minPerpCorners = projections.filter((p) => Math.abs(p.perpProj - minPerpProj) < 0.001);
  const c1 = minPerpCorners.reduce((best, curr) =>
    curr.shadowProj > best.shadowProj ? curr : best,
  ).idx;

  // Among corners with max perp projection, pick the one with highest shadow projection
  const maxPerpCorners = projections.filter((p) => Math.abs(p.perpProj - maxPerpProj) < 0.001);
  const c2 = maxPerpCorners.reduce((best, curr) =>
    curr.shadowProj > best.shadowProj ? curr : best,
  ).idx;

  // Determine traversal direction: choose the path that passes through
  // corners with HIGHER shadow projection (i.e., more in the shadow direction)
  const clockwiseSteps = (c2 - c1 + 4) % 4;
  const counterSteps = (c1 - c2 + 4) % 4;

  let goClockwise: boolean;
  if (clockwiseSteps !== counterSteps) {
    // Choose the shorter path
    goClockwise = clockwiseSteps < counterSteps;
  } else {
    // Tie (happens at 45°, 135°, 225°, 315°): compare shadow projection of middle corners
    const clockwiseMid = (c1 + 1) % 4;
    const counterMid = (c1 - 1 + 4) % 4;
    goClockwise = projections[clockwiseMid].shadowProj > projections[counterMid].shadowProj;
  }

  // Build polygon
  const polygon: string[] = [];

  // Fixed offset to extend middle corners outward from element center
  // This ensures the clip-path stays inside the rounded corners on the shadow side
  const cornerInset = 15; // 15% inset toward center

  // Helper to get corner moved inward toward center
  const getInsetCorner = (cornerIdx: number) => {
    const corner = BOX_CORNERS[cornerIdx];
    // Direction from corner toward center (50, 50)
    const dx = 50 - corner.x;
    const dy = 50 - corner.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return corner;
    // Move inward toward center
    return {
      x: corner.x + (dx / len) * cornerInset,
      y: corner.y + (dy / len) * cornerInset,
    };
  };

  // Start at c1 (exact position - this is where shadow meets element)
  polygon.push(`${BOX_CORNERS[c1].x}% ${BOX_CORNERS[c1].y}%`);

  // Traverse to c2 via the shadow-facing path
  // Middle corners get extended outward to cover rounded corners
  let curr = c1;
  if (goClockwise) {
    while (curr !== c2) {
      curr = (curr + 1) % 4;
      if (curr === c2) {
        // c2 stays at exact position
        polygon.push(`${BOX_CORNERS[curr].x}% ${BOX_CORNERS[curr].y}%`);
      } else {
        // Middle corners get extended outward
        const ext = getInsetCorner(curr);
        polygon.push(`${ext.x}% ${ext.y}%`);
      }
    }
  } else {
    while (curr !== c2) {
      curr = (curr - 1 + 4) % 4;
      if (curr === c2) {
        // c2 stays at exact position
        polygon.push(`${BOX_CORNERS[curr].x}% ${BOX_CORNERS[curr].y}%`);
      } else {
        // Middle corners get extended outward
        const ext = getInsetCorner(curr);
        polygon.push(`${ext.x}% ${ext.y}%`);
      }
    }
  }

  // Extend outward from c2 in the shadow direction
  polygon.push(`${BOX_CORNERS[c2].x + extendX}% ${BOX_CORNERS[c2].y + extendY}%`);

  // Extend back to c1's outward point
  polygon.push(`${BOX_CORNERS[c1].x + extendX}% ${BOX_CORNERS[c1].y + extendY}%`);

  return `polygon(${polygon.join(", ")})`;
}

/**
 * Calculate box-shadow offsets based on light angle and height
 */
function calculateShadows(angle: number, height: number, strength: number): string {
  // Normalize angle
  const normalizedAngle = ((angle % 360) + 360) % 360;

  // Shadow extends opposite to light
  const shadowAngle = normalizedAngle + 180;
  const radians = (shadowAngle * Math.PI) / 180;

  // Shadow direction (opposite to light)
  // In CSS, Y increases downward, so negate dy
  const dx = Math.cos(radians);
  const dy = -Math.sin(radians);

  // Scale shadow length by height
  const maxOffset = Math.min(height * 2, 200);
  const steps = 9;
  const opacitySteps = [0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.02, 0.01];

  const shadows: string[] = [];

  for (let i = 0; i < steps; i++) {
    const stepOffset = ((i + 1) / steps) * maxOffset;
    const offsetX = dx * stepOffset;
    const offsetY = dy * stepOffset;
    const opacity = opacitySteps[i] * strength;

    shadows.push(`${offsetX}px ${offsetY}px 0 0 rgba(0, 0, 0, ${opacity})`);
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
}: CastShadowProps) {
  // Calculate dynamic styles
  const clipPath = calculateClipPath(lightAngle, borderRadius);
  const boxShadow = calculateShadows(lightAngle, height, strength);

  // Adjust strength based on height (taller = stronger shadow)
  const adjustedStrength = Math.min(strength * (1 + height / 100), 1);

  return (
    <div
      className={clsx("cast-shadow", className)}
      style={
        {
          "--cast-shadow-strength": String(adjustedStrength),
          "--cast-shadow-box-shadow": boxShadow,
          "--cast-shadow-border-radius": `${borderRadius}%`,
          ...style,
        } as CSSProperties
      }
    >
      <div
        className="cast-shadow__layer"
        style={{
          clipPath,
        }}
      />
      <div className="cast-shadow__content">{children}</div>
    </div>
  );
}
