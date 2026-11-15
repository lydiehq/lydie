import { useContributions, useDeviceSetting, useShortcut, useStatus } from "@lydie/plugin-api";
import {
  AddRegular,
  Button,
  KeyCaps,
  Search2Regular,
  sidebarItemStyles,
  SidebarNotice,
  sidebarSectionTitleClass,
  StatusBanner,
  SyncIndicator,
} from "@lydie/ui";
import type { ReactNode } from "react";

import { useHostInternal } from "./context.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { dragStyle, useTitleBarInset } from "./title-bar.ts";
import { WorkspaceMenu } from "./WorkspaceMenu.tsx";

type Props = {
  // Rendered at the bottom (e.g. the app's account entry point: "Join the cloud waitlist" or
  // "Sign in to Lydie Cloud").
  footer?: ReactNode;
};

// A row that runs a command, laid out as the plugins' own rows (Home, Trash), with the command's
// shortcut at its end (as Numina's search button shows ⌘K).
function ActionRow({
  label,
  icon,
  hotkeys,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  hotkeys: ReturnType<typeof useShortcut>;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={sidebarItemStyles({ className: "mx-2 gap-1.5 px-1.5" })}
    >
      {icon}
      <span className="min-w-0 grow truncate text-left">{label}</span>
      {hotkeys && <KeyCaps hotkeys={hotkeys} className="shrink-0 pr-0.5 text-xs font-normal" />}
    </button>
  );
}

// Shown until dismissed, once per device.
function BetaNotice() {
  const [dismissed, setDismissed] = useDeviceSetting("shell.betaNoticeDismissed", false);
  if (dismissed) return null;
  return (
    <div className="mb-2 flex shrink-0 flex-col">
      <SidebarNotice
        title="Lydie is in beta"
        onDismiss={() => setDismissed(true)}
        testId="beta-notice"
      >
        It is under active development, so expect rough edges and frequent changes.
      </SidebarNotice>
    </div>
  );
}

export function Sidebar({ footer }: Props) {
  const host = useHostInternal();
  const inset = useTitleBarInset(host.platform);
  const contributed = useContributions("sidebar");
  const replaced = new Set(contributed.flatMap((s) => s.replaces ?? []));
  const sections = contributed.filter((s) => !replaced.has(s.id));
  const statusItems = useContributions("statusBar");
  const status = useStatus();
  // Search opens the command palette, which finds documents by title and content as well as
  // commands (Numina's search button opens its command menu).
  const searchKeys = useShortcut("core.palette");
  const newKeys = useShortcut("core.newDocument");
  // Search and New document are rows of their own. They follow a leading section that is
  // itself a row (Home), as one group with it; without one they lead the column.
  const lead = sections[0] && !sections[0].title && !sections[0].fill ? sections[0] : null;
  const actions = (
    <div className="flex shrink-0 flex-col">
      <ActionRow
        label="Search"
        icon={<Search2Regular aria-hidden className="size-4 text-gray-500" />}
        hotkeys={searchKeys}
        onPress={() => void host.app.runCommand("core.palette")}
      />
      <ActionRow
        label="New document"
        icon={<AddRegular aria-hidden className="size-4 text-gray-500" />}
        hotkeys={newKeys}
        onPress={() => void host.app.runCommand("core.newDocument")}
      />
    </div>
  );
  const renderSection = (section: (typeof sections)[number]) => (
    <section
      key={`${section.pluginId}:${section.id}`}
      aria-label={section.title ?? section.id}
      // A section that renders nothing (no favorites yet) takes no room in the column.
      className={`group/section empty:hidden ${section.fill ? "flex min-h-0 flex-1 flex-col" : "flex shrink-0 flex-col"}`}
    >
      {section.title && (
        <div className="flex items-center gap-px pr-3 pb-1 pl-4">
          <h2 className={`grow ${sidebarSectionTitleClass}`}>{section.title}</h2>
          {/* The tree rows' hover actions, at the same size. */}
          {section.actions?.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="icon-xs"
              aria-label={action.label}
              tooltipOptions={{ placement: "top", offset: 8 }}
              onPress={() => void action.run(host.app)}
              className="-my-0.5 text-gray-500 opacity-0 group-hover/section:opacity-100 hover:text-gray-700 focus-visible:opacity-100"
            >
              {action.icon}
            </Button>
          ))}
        </div>
      )}
      <ErrorBoundary label={`Sidebar (${section.pluginId})`} compact>
        <section.component />
      </ErrorBoundary>
    </section>
  );

  return (
    <nav aria-label="Sidebar" className="flex h-full min-h-0 flex-col" data-testid="sidebar">
      {/* As in Linear: a drawn title bar gets a row of its own for the window buttons; without
          one (web, native frame) the workspace row is level with the tab row. The sidebar's
          toggle starts the tab row (`TabBar` in LayoutView.tsx), open or collapsed. Peeking, the
          sidebar starts below the tab row, which holds the window buttons. */}
      {inset.custom && <div className="h-10 shrink-0 [[data-peek]_&]:hidden" style={dragStyle} />}
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <WorkspaceMenu />
      </div>
      {status.rejected && status.rejected.length > 0 && (
        <StatusBanner
          kind="error"
          variant="card"
          className="mx-2"
          action={
            host.backend.status.dismissRejected && (
              <Button
                variant="ghost"
                size="xs"
                onPress={() => host.backend.status.dismissRejected?.()}
              >
                Dismiss
              </Button>
            )
          }
        >
          {status.rejected.length} change{status.rejected.length === 1 ? " was" : "s were"} refused
          by the server: {status.rejected[0]!.reason.message}
        </StatusBanner>
      )}
      {!host.backend.info.persistent && !host.backend.info.ephemeral && (
        <StatusBanner kind="warning" variant="card" className="mx-2">
          This browser is not keeping your notes: they are lost when the tab closes.
        </StatusBanner>
      )}
      <div className="flex min-h-0 grow flex-col gap-3 overflow-hidden py-2">
        <div className="flex shrink-0 flex-col">
          {lead && renderSection(lead)}
          {actions}
        </div>
        {sections.filter((section) => section !== lead).map(renderSection)}
      </div>
      <BetaNotice />
      <div className="flex shrink-0 flex-col gap-1 border-t border-gray-950/5 px-3 py-2">
        {footer}
        {/* Wraps rather than squeezing: on a narrow sidebar the status items take a line of their
            own, still on the right. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {!statusItems.some((item) => item.replacesSyncIndicator) && (
            <SyncIndicator
              state={status.sync}
              pending={status.pendingOperations + status.pendingUploads}
              conflicts={status.conflicts}
              rejected={status.rejected?.length ?? 0}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            {statusItems.map((item) => (
              <ErrorBoundary
                key={`${item.pluginId}:${item.id}`}
                label={`Status (${item.pluginId})`}
                compact
              >
                <item.component />
              </ErrorBoundary>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
