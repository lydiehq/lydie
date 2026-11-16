import clsx from "clsx";
import { useId } from "react";
import type { CSSProperties } from "react";

import { MARK_PATH, SQUIRCLE_PATH } from "./cut";
import { ScribbleIcon } from "./Scribble";

// Who did something, at a glance: the shape says what kind of thing it is (a person is a circle, a
// place a squircle), the surface who drew it (people and places on paper, machines on a screen,
// Lydie itself in its green).

type GlyphProps = { size: number; className?: string | undefined };

// The Lydie mark in the current text colour.
export function LydieMark({ size = 16, className }: Partial<GlyphProps>) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className={clsx("shrink-0", className)}
    >
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

type AvatarProps = {
  // Stable for the person (their user id), so they look the same everywhere.
  seed: string;
  image?: string | null | undefined;
  size?: number;
  className?: string | undefined;
  style?: CSSProperties | undefined;
};

// A person: their picture, or a doodle in their pen on a round scrap of paper.
export function Avatar({ seed, image, size = 32, className, style }: AvatarProps) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className={clsx("shrink-0 rounded-full object-cover", className)}
        style={style}
      />
    );
  }
  return (
    <span data-avatar className={clsx("inline-flex shrink-0", className)} style={style}>
      <ScribbleIcon seed={seed} size={size} shape="circle" />
    </span>
  );
}

type BotAvatarProps = {
  // Stable for the app (its client name or id), so every Claude looks the same.
  seed: string;
  // The app's own logo, when it registered one.
  logo?: string | null | undefined;
  // The person it acted for, as a small badge in the corner.
  behalf?: { seed: string; image?: string | null | undefined } | null | undefined;
  size?: number;
  className?: string | undefined;
};

// A machine acting in the workspace (an MCP client, an API token, the CLI): its logo, or a doodle
// in a light colour on a dark screen. With `behalf`, the person it worked for sits in a cut-out at
// the bottom right.
export function BotAvatar({ seed, logo, behalf, size = 32, className }: BotAvatarProps) {
  const badge = Math.max(10, Math.round(size * 0.5));
  // The badge hangs a little off the corner; the cut-out leaves a gap of about 1.5 px round it.
  const overhang = Math.round(badge * 0.18);
  const centre = size - badge / 2 + overhang;
  const cut: CSSProperties | undefined = behalf
    ? {
        maskImage: `radial-gradient(circle at ${centre}px ${centre}px, transparent ${badge / 2 + 1.5}px, #000 ${badge / 2 + 2}px)`,
        WebkitMaskImage: `radial-gradient(circle at ${centre}px ${centre}px, transparent ${badge / 2 + 1.5}px, #000 ${badge / 2 + 2}px)`,
      }
    : undefined;
  return (
    <span
      data-bot-avatar
      className={clsx("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span className="inline-flex" style={cut}>
        {logo ? (
          <img
            src={logo}
            alt=""
            width={size}
            height={size}
            className="rounded-full bg-elevated object-cover"
          />
        ) : (
          <ScribbleIcon seed={seed} ink="screen" size={size} shape="circle" />
        )}
      </span>
      {behalf && (
        <Avatar
          seed={behalf.seed}
          image={behalf.image}
          size={badge}
          style={{ position: "absolute", right: -overhang, bottom: -overhang }}
        />
      )}
    </span>
  );
}

// Lydie itself (sync, restores, its own housekeeping): the mark in white on the brand's green.
export function LydieAvatar({ size = 32, className }: Partial<GlyphProps>) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden
      data-lydie-avatar
      className={clsx("shrink-0", className)}
    >
      <circle cx={50} cy={50} r={50} fill="#4c9e80" />
      <path d={MARK_PATH} fill="#fff" transform="translate(50 50) scale(0.6) translate(-50 -50)" />
    </svg>
  );
}

// A place (a workspace, a teamspace, an app): its picture, or a pen doodle on a beige squircle.
export function SpaceIcon({
  seed,
  image,
  size = 20,
  className,
}: Partial<GlyphProps> & { seed: string; image?: string | null | undefined }) {
  const clip = `space-${useId().replace(/[^\w-]/g, "")}`;
  if (image) {
    // Cut to the squircle in SVG: CSS `clip-path: path()` does not scale with the size.
    return (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        aria-hidden
        className={clsx("shrink-0", className)}
      >
        <clipPath id={clip}>
          <path d={SQUIRCLE_PATH} />
        </clipPath>
        <image
          href={image}
          width={100}
          height={100}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clip})`}
        />
      </svg>
    );
  }
  return <ScribbleIcon seed={seed} size={size} shape="squircle" className={className} />;
}
