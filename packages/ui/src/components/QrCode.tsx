import { useMemo } from "react";
import { twMerge } from "tailwind-merge";
import { encode } from "uqr";

type Props = {
  // What the code holds, e.g. an otpauth:// link.
  value: string;
  // Width and height in CSS pixels.
  size?: number;
  // Accessible name, e.g. "QR code for your authenticator app".
  label: string;
  className?: string;
};

// A QR code drawn as one SVG path. Always dark on white, in dark mode too: scanners need the
// contrast.
export function QrCode({ value, size = 160, label, className }: Props) {
  const src = useMemo(() => {
    const { data, size: width } = encode(value, { ecc: "M", border: 2 });
    let path = "";
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      }),
    );
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${width}" ` +
      `shape-rendering="crispEdges"><rect width="${width}" height="${width}" fill="#fff"/>` +
      `<path d="${path}" fill="#000"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [value]);
  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      className={twMerge("rounded-md [image-rendering:pixelated]", className)}
    />
  );
}
