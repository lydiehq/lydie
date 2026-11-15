// Quick capture: a small box that appends a line to the inbox note, without leaving what you are
// doing. In-app shortcut Mod+Shift+I. A global (system-wide) shortcut needs
// the desktop shell to register one and send the command id "quick-capture.open" through
// `platform.menus` (as menu items do); the handler is this command.
import { definePlugin, useApp } from "@lydie/plugin-api";
import { Button, FlashRegular } from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";

import { capture } from "./capture.ts";

function CaptureBox({ close }: { close: () => void; props: unknown }) {
  const app = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await capture(app, text);
      app.notify({ title: "Added to the inbox" });
      close();
    } catch (error) {
      app.notify({ title: "Could not capture", description: String(error), kind: "error" });
      setBusy(false);
    }
  };

  return (
    // A light non-modal box at the top of the window; Escape or a click outside closes it.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-gray-950/10 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form
        role="dialog"
        aria-label="Quick capture"
        className="flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-xl bg-elevated p-3 shadow-popover"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === "Enter" && !e.shiftKey) {
            // Enter adds; Shift+Enter makes a new line.
            e.preventDefault();
            void submit();
          }
        }}
      >
        {/* Borderless: the box around it is the field. */}
        <textarea
          ref={ref}
          aria-label="Capture"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write something to keep… (Enter adds, Shift+Enter for a new line)"
          className="resize-none rounded-md px-1 text-sm text-gray-900 outline-none"
        />
        <div className="flex items-center gap-2">
          <span className="grow px-1 text-xs text-gray-500">Adds to the inbox</span>
          <Button size="sm" variant="ghost" onPress={close}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" isDisabled={!text.trim() || busy}>
            Add
          </Button>
        </div>
      </form>
    </div>
  );
}

export const quickCapturePlugin = definePlugin({
  id: "quick-capture",
  name: "Quick capture",
  description: "Jot something down into the inbox from anywhere in the app.",
  activate(ctx) {
    ctx.overlays.register({ id: "quick-capture", component: CaptureBox });
    ctx.commands.register({
      id: "quick-capture.open",
      title: "Quick capture",
      icon: <FlashRegular />,
      group: "General",
      keybinding: "Mod+Shift+I",
      run: ({ app }) => app.overlays.open("quick-capture"),
    });
  },
});

export default quickCapturePlugin;
