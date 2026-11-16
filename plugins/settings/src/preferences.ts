// Per-device preferences (this plugin's `app.storage`) and how the window applies them: the editor
// reads them as CSS variables on <html>, not from storage. apps/web/public/theme.js reads the theme
// before the app loads, under its stored name (`plugin:settings:appearance.theme`).
import type { AppApi } from "@lydie/plugin-api";

export const PREFS = {
  theme: "appearance.theme",
  fontSize: "editor.fontSize",
  lineWidth: "editor.lineWidth",
  spellcheck: "editor.spellcheck",
} as const;

export type Theme = "light" | "dark" | "system";
export type LineWidth = "narrow" | "default" | "wide" | "full";

export const DEFAULTS = {
  // Light until the person picks dark or system (apps/web/public/theme.js mirrors it).
  theme: "light" as Theme,
  fontSize: 15,
  lineWidth: "default" as LineWidth,
  spellcheck: true,
};

export const FONT_SIZES = [13, 14, 15, 16, 17, 18, 20];

// `--editor-block-max-width` of the editor's content (null: the editor's own default).
export const LINE_WIDTHS: Record<LineWidth, { label: string; css: string | null }> = {
  narrow: { label: "Narrow", css: "560px" },
  default: { label: "Default", css: null },
  wide: { label: "Wide", css: "880px" },
  full: { label: "Full width", css: "none" },
};

// Applies the theme, the editor's measurements and spellchecking to the window, now and whenever they change.
// Returns the cleanup.
export function applyPreferences(app: AppApi): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  const apply = () => {
    const theme = app.storage.get<Theme>(PREFS.theme) ?? DEFAULTS.theme;
    const dark = theme === "dark" || (theme === "system" && Boolean(media?.matches));
    root.classList.toggle("dark", dark);
    root.classList.toggle("system", theme === "system");
    root.dataset.theme = theme;
    app.setColorScheme(theme);
    const size = app.storage.get<number>(PREFS.fontSize) ?? DEFAULTS.fontSize;
    if (size === DEFAULTS.fontSize) root.style.removeProperty("--editor-font-size");
    else root.style.setProperty("--editor-font-size", `${size}px`);
    const width = LINE_WIDTHS[app.storage.get<LineWidth>(PREFS.lineWidth) ?? DEFAULTS.lineWidth];
    if (width?.css) root.style.setProperty("--editor-block-max-width", width.css);
    else root.style.removeProperty("--editor-block-max-width");
    // Inherited by every editable element that does not set its own.
    root.spellcheck = app.storage.get<boolean>(PREFS.spellcheck) ?? DEFAULTS.spellcheck;
  };
  apply();
  const offs = [PREFS.theme, PREFS.fontSize, PREFS.lineWidth, PREFS.spellcheck].map(
    (key) => app.storage.subscribe?.(key, apply) ?? (() => {}),
  );
  media?.addEventListener("change", apply);
  return () => {
    for (const off of offs) off();
    media?.removeEventListener("change", apply);
  };
}
