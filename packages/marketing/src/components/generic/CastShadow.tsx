import { clsx } from "clsx";
import { type CSSProperties, type ReactNode } from "react";

interface CastShadowProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  strength?: number;
  blur?: number;
}

export function CastShadow({
  children,
  className,
  style,
  strength = 0.2,
  blur = 10,
}: CastShadowProps) {
  return (
    <div
      className={clsx("cast-shadow", className)}
      style={{ "--cast-shadow-strength": String(strength), ...style } as CSSProperties}
    >
      <div className="cast-shadow__layer" style={{ filter: `blur(${blur}px)` }} />
      <div className="cast-shadow__content">{children}</div>
    </div>
  );
}
