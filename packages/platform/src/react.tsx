import { createContext, use } from "react";
import type { ReactNode } from "react";

import type { Platform } from "./types.ts";

const PlatformContext = createContext<Platform | null>(null);

type Props = { platform: Platform; children: ReactNode };

export function PlatformProvider({ platform, children }: Props) {
  return <PlatformContext value={platform}>{children}</PlatformContext>;
}

export function usePlatform(): Platform {
  const platform = use(PlatformContext);
  if (!platform) throw new Error("usePlatform() needs a <PlatformProvider> above it");
  return platform;
}
