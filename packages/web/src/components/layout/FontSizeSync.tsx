import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { rootFontSizeAtom, getFontSizePixels } from "@/stores/font-size";

/**
 * Component that syncs the root font size atom to the HTML root element's font-size.
 * This ensures that when the atom changes, the font size is immediately applied.
 * If the font size is "default", we remove the explicit font-size to use the browser default.
 */
export function FontSizeSync() {
  const fontSizeOption = useAtomValue(rootFontSizeAtom);

  useEffect(() => {
    if (fontSizeOption === "default") {
      // Remove explicit font-size to use browser default
      document.documentElement.style.removeProperty("font-size");
    } else {
      const fontSizePixels = getFontSizePixels(fontSizeOption);
      document.documentElement.style.fontSize = `${fontSizePixels}px`;
    }
  }, [fontSizeOption]);

  return null;
}

