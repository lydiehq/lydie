import { ContributionBoundary, useContributions, useWorkspaceImage } from "@lydie/plugin-api";
import { Button, Dialog, Popover, SpaceIcon } from "@lydie/ui";
import { useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useHostInternal } from "./context.ts";

// The sidebar's top-left workspace button. Its menu is made of plugin sections (workspaces,
// account, settings); without any it opens the settings.
export function WorkspaceMenu({ style }: { style?: CSSProperties }) {
  const host = useHostInternal();
  const sections = [...useContributions("workspaceMenu")].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100),
  );
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const name = host.backend.info.workspaceName;
  const image = useWorkspaceImage();
  return (
    <>
      {/* The radius of the search and new-document buttons beside it. */}
      <Button
        ref={trigger}
        variant="ghost"
        size="sm"
        style={style}
        aria-label={`Workspace: ${name}`}
        aria-haspopup={sections.length > 0 ? "dialog" : undefined}
        aria-expanded={sections.length > 0 ? open : undefined}
        className="min-w-0 shrink grow justify-start gap-2 px-1.5 text-left text-gray-800 [--button-radius:var(--radius-lg)]"
        onPress={() =>
          sections.length > 0 ? setOpen(true) : void host.app.runCommand("core.openSettings")
        }
      >
        {/* Seeded by name: a desktop folder's id in the switcher is not its workspace id. */}
        <SpaceIcon seed={name} image={image} size={20} />
        <span className="truncate">{name}</span>
      </Button>
      <Popover
        triggerRef={trigger}
        isOpen={open}
        onOpenChange={setOpen}
        placement="bottom start"
        className="w-72"
      >
        <Dialog aria-label="Workspace menu" className="flex flex-col py-1">
          {sections.map((section, index) => (
            <div
              key={`${section.pluginId}:${section.id}`}
              className={index > 0 ? "border-t border-gray-950/5" : undefined}
            >
              <ContributionBoundary pluginId={section.pluginId} label="Workspace menu" compact>
                <section.component close={() => setOpen(false)} />
              </ContributionBoundary>
            </div>
          ))}
        </Dialog>
      </Popover>
    </>
  );
}
