import { useApp } from "@lydie/plugin-api";
import type { CommandInfo } from "@lydie/plugin-api";
import {
  Button,
  Input,
  SearchField,
  SettingsCard,
  SettingsCardEmpty,
  SettingsCardHeader,
  SettingsSection,
} from "@lydie/plugin-api/ui";
import { useState, useSyncExternalStore } from "react";

import { bindingOf, conflictsOf, isUsableBinding, normaliseBinding } from "../shortcuts.ts";
import { GlobalShortcutCard } from "./GlobalShortcut.tsx";

type Pending = { binding: string; conflicts: CommandInfo[] };

function ShortcutRow({ command, commands }: { command: CommandInfo; commands: CommandInfo[] }) {
  const app = useApp();
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const mac = app.formatKeybinding("Mod+K").startsWith("⌘");

  const assign = (binding: string, conflicts: CommandInfo[]) => {
    for (const other of conflicts) {
      const taken = normaliseBinding(binding);
      app.keymap.set(
        other.id,
        other.keybindings.filter((k) => normaliseBinding(k) !== taken),
      );
    }
    app.keymap.set(command.id, [binding]);
    setPending(null);
  };

  return (
    <li className="flex flex-col gap-1 px-4 py-2" data-testid="shortcut-row">
      <div className="flex items-center gap-3 text-sm">
        <span className="grow text-gray-800">
          {command.title}
          {command.group && <span className="ml-2 text-xs text-gray-400">{command.group}</span>}
        </span>
        {recording ? (
          // Captures the next key press instead of taking text, sized like the button it replaces.
          <Input
            aria-label={`New shortcut for ${command.title}`}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- recording starts on click
            autoFocus
            readOnly
            placeholder="Press keys…"
            onBlur={() => setRecording(false)}
            onKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === "Escape") return setRecording(false);
              const binding = bindingOf(event.nativeEvent, mac);
              if (!binding) return;
              setRecording(false);
              if (!isUsableBinding(binding)) {
                setProblem("Add a modifier key (⌘, Ctrl, Alt or Shift), or use a function key.");
                return;
              }
              setProblem(null);
              const conflicts = conflictsOf(commands, binding, command.id);
              if (conflicts.length) setPending({ binding, conflicts });
              else assign(binding, []);
            }}
            size="sm"
            className="w-40 flex-none"
          />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Change shortcut for ${command.title}`}
            className="min-w-24"
            onPress={() => {
              setPending(null);
              setProblem(null);
              setRecording(true);
            }}
          >
            {command.keybindings.length
              ? command.keybindings.map((k) => app.formatKeybinding(k)).join(", ")
              : "Not set"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onPress={() => app.keymap.set(command.id, [])}>
          Clear
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setPending(null);
            app.keymap.set(command.id, null);
          }}
        >
          Reset
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-600">
          {problem}
        </p>
      )}
      {pending && (
        <div role="alert" className="flex items-center gap-2 text-xs text-amber-800">
          <span className="grow">
            {app.formatKeybinding(pending.binding)} is already used by{" "}
            {pending.conflicts.map((c) => c.title).join(", ")}.
          </span>
          <Button
            size="xs"
            variant="secondary"
            onPress={() => assign(pending.binding, pending.conflicts)}
          >
            Use it here
          </Button>
          <Button size="xs" variant="ghost" onPress={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

export function ShortcutsPage() {
  const app = useApp();
  const [filter, setFilter] = useState("");
  useSyncExternalStore(app.keymap.subscribe, () =>
    app
      .commands()
      .map((c) => c.keybindings.join())
      .join("|"),
  );
  // A command that is not bindable still shows while it has a key, so an old binding can be cleared.
  const commands = app
    .commands()
    .filter((c) => c.bindable || c.keybindings.length > 0)
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.title.localeCompare(b.title));
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = commands.filter((c) => {
    const text =
      `${c.title} ${c.group ?? ""} ${c.keybindings.map((k) => app.formatKeybinding(k)).join(" ")}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  return (
    <SettingsSection
      title="Commands"
      description="Shortcuts are kept on this device. Click one and press the new keys."
    >
      <GlobalShortcutCard />
      <SettingsCard>
        <SettingsCardHeader
          title={
            <SearchField
              aria-label="Filter shortcuts"
              placeholder={`Filter ${commands.length} commands`}
              value={filter}
              onChange={setFilter}
              size="sm"
              className="w-64 font-normal"
            />
          }
          actions={
            <Button
              size="sm"
              variant="secondary"
              onPress={async () => {
                if (
                  await app.confirm({
                    message: "Reset all shortcuts?",
                    detail: "Every command goes back to its default keys.",
                    confirmLabel: "Reset all",
                  })
                ) {
                  for (const c of commands) app.keymap.set(c.id, null);
                }
              }}
            >
              Reset all
            </Button>
          }
        />
        {shown.length === 0 ? (
          <SettingsCardEmpty>No commands match “{filter}”.</SettingsCardEmpty>
        ) : (
          <ul aria-label="Keyboard shortcuts" className="divide-y divide-gray-950/5">
            {shown.map((c) => (
              <ShortcutRow key={c.id} command={c} commands={commands} />
            ))}
          </ul>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
