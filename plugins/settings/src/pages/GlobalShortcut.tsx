// The system-wide quick-capture shortcut (desktop): shown and rebound through `app.shortcuts`.
import { useApp } from "@lydie/plugin-api";
import { Button, Input, SettingsCard } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

// A keydown as an Electron accelerator ("CommandOrControl+Shift+Space"), or null for a lone
// modifier or a key without one (global shortcuts need a modifier).
export function acceleratorOf(event: {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;
  const code = event.code;
  const key = code.startsWith("Key")
    ? code.slice(3)
    : code.startsWith("Digit")
      ? code.slice(5)
      : code === "Space"
        ? "Space"
        : event.key.length === 1
          ? event.key.toUpperCase()
          : event.key;
  return [...parts, key].join("+");
}

export function formatAccelerator(accelerator: string, mac: boolean): string {
  return accelerator
    .split("+")
    .map((p) =>
      p === "CommandOrControl"
        ? mac
          ? "⌘"
          : "Ctrl"
        : p === "Alt"
          ? mac
            ? "⌥"
            : "Alt"
          : p === "Shift"
            ? mac
              ? "⇧"
              : "Shift"
            : p,
    )
    .join(mac ? "" : "+");
}

// Desktop only: rendered at the top of the Commands section (nothing elsewhere).
export function GlobalShortcutCard() {
  const app = useApp();
  const shortcuts = app.shortcuts;
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const mac = app.formatKeybinding("Mod+K").startsWith("⌘");
  useEffect(() => {
    void shortcuts?.quickCapture().then(setCurrent);
  }, [shortcuts]);
  if (!shortcuts) return null;
  const set = async (accelerator: string | null) => {
    setProblem(null);
    if (await shortcuts.setQuickCapture(accelerator)) setCurrent(accelerator);
    else setProblem("Another app or the system already uses that shortcut.");
  };
  return (
    <SettingsCard>
      <div className="flex items-center gap-3 px-4 py-2 text-sm" data-testid="global-shortcut">
        <span className="grow text-gray-800">
          Quick capture
          <span className="ml-2 text-xs text-gray-400">Global, works in the background</span>
        </span>
        {recording ? (
          // Captures the next key press instead of taking text, sized like the button it replaces.
          <Input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- recording starts on press
            autoFocus
            readOnly
            aria-label="Press the new shortcut"
            placeholder="Press keys…"
            onBlur={() => setRecording(false)}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              event.preventDefault();
              if (event.key === "Escape") return setRecording(false);
              const accelerator = acceleratorOf(event);
              if (!accelerator) return;
              setRecording(false);
              void set(accelerator);
            }}
            size="sm"
            className="w-40 flex-none"
          />
        ) : (
          <Button size="sm" variant="secondary" onPress={() => setRecording(true)}>
            {current === undefined ? "…" : current ? formatAccelerator(current, mac) : "Off"}
          </Button>
        )}
        {current && (
          <Button size="sm" variant="ghost" onPress={() => void set(null)}>
            Turn off
          </Button>
        )}
      </div>
      {problem && (
        <p role="alert" className="px-4 pb-2 text-xs text-red-600">
          {problem}
        </p>
      )}
    </SettingsCard>
  );
}
