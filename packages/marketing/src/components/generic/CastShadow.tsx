import { clsx } from "clsx";
import { useMemo, type ReactNode } from "react";

import "./CastShadow.css";

interface CastShadowProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  strength?: number;
  height?: number;
  lightAngle?: number;
  animate?: boolean;
  borderRadius?: string | number;
}

function round(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

function calculateBoxShadow(angle: number, height: number, strength: number): string {
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
    const offsetX = round(dx * stepOffset, 2);
    const offsetY = round(dy * stepOffset, 2);
    const opacity = opacitySteps[i] * strength;
    shadows.push(`${offsetX}px ${offsetY}px 0 0 rgba(0, 0, 0, ${opacity})`);
  }

  return shadows.join(", ");
}

// Calculates the clip path for the shadow based on the light angle.
export function calculateClipPath(angle: number): string {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const shadowRadians = ((normalizedAngle + 180) * Math.PI) / 180;
  const shadowDx = Math.cos(shadowRadians);
  const shadowDy = -Math.sin(shadowRadians);
  const extendX = shadowDx * 1000;
  const extendY = shadowDy * 1000;
  const perpDx = -shadowDy;
  const perpDy = shadowDx;

  const corners = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  const projections = corners.map((corner, idx) => ({
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
    const corner = corners[cornerIdx];
    const dx = 50 - corner.x;
    const dy = 50 - corner.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return corner;
    return {
      x: corner.x + (dx / len) * cornerInset,
      y: corner.y + (dy / len) * cornerInset,
    };
  };

  polygon.push(`${corners[c1].x}% ${corners[c1].y}%`);

  let curr = c1;
  if (goClockwise) {
    while (curr !== c2) {
      curr = (curr + 1) % 4;
      if (curr === c2) {
        polygon.push(`${corners[curr].x}% ${corners[curr].y}%`);
      } else {
        const ext = getInsetCorner(curr);
        polygon.push(`${ext.x}% ${ext.y}%`);
      }
    }
  } else {
    while (curr !== c2) {
      curr = (curr - 1 + 4) % 4;
      if (curr === c2) {
        polygon.push(`${corners[curr].x}% ${corners[curr].y}%`);
      } else {
        const ext = getInsetCorner(curr);
        polygon.push(`${ext.x}% ${ext.y}%`);
      }
    }
  }

  polygon.push(`${corners[c2].x + extendX}% ${corners[c2].y + extendY}%`);
  polygon.push(`${corners[c1].x + extendX}% ${corners[c1].y + extendY}%`);

  const roundedPolygon = polygon.map((point) => {
    const [x, y] = point.split("% ");
    return `${round(Number.parseFloat(x), 4)}% ${round(Number.parseFloat(y), 4)}%`;
  });

  return `polygon(${roundedPolygon.join(", ")})`;
}

export function CastShadow({
  children,
  className,
  style,
  strength = 0.15,
  height = 120,
  lightAngle = 135,
  animate = false,
}: CastShadowProps) {
  const boxShadow = useMemo(
    () => calculateBoxShadow(lightAngle, height, strength),
    [lightAngle, height, strength],
  );

  const clipPath = useMemo(() => calculateClipPath(lightAngle), [lightAngle]);

  return (
    <div
      className={clsx("cast-shadow", className, {
        "cast-shadow--animate": animate,
      })}
      style={{
        ...style,
      }}
    >
      <div
        className="cast-shadow__layer"
        style={{
          clipPath,
          boxShadow,
        }}
      />
      <div className="cast-shadow__content">{children}</div>
    </div>
  );
}
