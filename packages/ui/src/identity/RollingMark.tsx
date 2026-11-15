import clsx from "clsx";
import { useEffect, useRef } from "react";

import { MARK_SHAPE } from "./cut";

// The loader: the mark as a ball cut by a slab (a flat slice of space) that rolls forward along
// the band, so the cut goes over the top, round the back and comes up from below. With the slab's
// normal tipped slightly away from the viewer its front edge projects onto the band, so the
// resting pose is the mark. Painted per pixel on a canvas in `currentColor`; reduced motion shows
// the resting pose.

type Vec = [number, number, number];

const ROLL_MS = 2600;

// Rotates v about the unit axis a by th radians (Rodrigues).
function turn(v: Vec, a: Vec, th: number): Vec {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const d = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
  const x: Vec = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
  return [0, 1, 2].map((i) => v[i]! * c + x[i]! * s + a[i]! * d * (1 - c)) as Vec;
}

// In the band's own frame (the mark's tilt undone), unit radius, y down, z towards the viewer.
const BALL = (() => {
  const band = MARK_SHAPE.bands[0]!;
  // The flat band is a parabola and the slab projects to an ellipse; nudging the slab up and
  // widening it a little makes the two overlap at rest.
  const y0 = Math.min(0.95, band.offset / 50 - 0.02);
  const yRim = (band.offset - band.sag) / 50;
  const z0 = Math.sqrt(1 - y0 * y0);
  const a = Math.atan2(yRim - y0, z0);
  const n: Vec = [0, Math.cos(a), Math.sin(a)];
  return {
    n,
    d: n[1] * yRim,
    w: 1.05 * (band.thick / 50) * (n[1] - (n[2] * y0) / z0),
    tilt: (MARK_SHAPE.tilt * Math.PI) / 180,
    // Corner radius, like the static mark's tips.
    k: 0.068,
  };
})();

function paint(ctx: CanvasRenderingContext2D, img: ImageData, n: Vec, color: string) {
  const S = img.width;
  const px = img.data;
  px.fill(0);
  const R = S / 2;
  const k = BALL.k * R;
  const ct = Math.cos(BALL.tilt);
  const st = Math.sin(BALL.tilt);
  const lim = (1 + 1 / R) ** 2;
  for (let j = 0; j < S; j++) {
    const Y = (j + 0.5 - R) / R;
    for (let i = 0; i < S; i++) {
      const X = (i + 0.5 - R) / R;
      const rr = X * X + Y * Y;
      if (rr > lim) continue;
      const z = Math.sqrt(Math.max(0, 1 - rr));
      const x = X * ct - Y * st;
      const y = X * st + Y * ct;
      // Signed distances in pixels, positive inside the solid: to the rim and to the slab.
      const dr = (1 - Math.sqrt(rr)) * R;
      const zz = Math.max(z, 0.02);
      const gl = Math.hypot(n[0] - (n[2] * x) / zz, n[1] - (n[2] * y) / zz) || 1e-6;
      const ds = ((Math.abs(x * n[0] + y * n[1] + z * n[2] - BALL.d) - BALL.w / 2) / gl) * R;
      const sd =
        dr > k && ds > k
          ? Math.min(dr, ds)
          : k - Math.hypot(Math.max(k - dr, 0), Math.max(k - ds, 0));
      const alpha = Math.min(1, sd + 0.5);
      if (alpha > 0) px[(j * S + i) * 4 + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // The mask takes the colour as it is (oklch included), rather than parsing it.
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";
}

export function RollingMark({ size = 16, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pixels = Math.round(size * Math.min(2, globalThis.devicePixelRatio || 1));

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = ctx.createImageData(pixels, pixels);
    const color = getComputedStyle(canvas).color;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(ctx, img, BALL.n, color);
      return;
    }
    let raf = 0;
    const frame = (now: number) => {
      paint(ctx, img, turn(BALL.n, [1, 0, 0], ((now / ROLL_MS) % 1) * Math.PI * 2), color);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pixels]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      width={pixels}
      height={pixels}
      style={{ width: size, height: size }}
      className={clsx("block shrink-0", className)}
    />
  );
}
