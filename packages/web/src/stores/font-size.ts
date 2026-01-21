import { atomWithStorage } from "jotai/utils"

export type FontSizeOption = "xs" | "s" | "default" | "l" | "xl"

// Font size mapping from labels to pixel values
export const FONT_SIZE_MAP: Record<FontSizeOption, number> = {
  xs: 12,
  s: 14,
  default: 16,
  l: 18,
  xl: 20,
}

// Default font size is "default" (16px - browser default)
const DEFAULT_FONT_SIZE: FontSizeOption = "default"

// Font size atom with localStorage persistence
export const rootFontSizeAtom = atomWithStorage<FontSizeOption>("lydie-root-font-size", DEFAULT_FONT_SIZE)

// Helper function to get pixel value from font size option
export function getFontSizePixels(size: FontSizeOption): number {
  return FONT_SIZE_MAP[size]
}
