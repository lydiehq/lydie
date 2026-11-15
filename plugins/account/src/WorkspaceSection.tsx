import { useAccount, useApp, useWorkspaceImage } from "@lydie/plugin-api";
import type { HostedWorkspaceSummary, WorkspaceScope } from "@lydie/plugin-api";
import {
  AddRegular,
  CheckRegular,
  CloudRegular,
  ExitRegular,
  focusRingInsetClass,
  FolderOpenRegular,
  SpaceIcon,
  User3Regular,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import clsx from "./clsx.ts";
import { errorMessage } from "./format.ts";
import { toCloud } from "./sign-up.ts";

function Row({
  children,
  icon,
  image,
  glyph,
  onPress,
  current,
  hint,
  testId,
  title,
}: {
  children: ReactNode;
  // The workspace's icon, seeded by its name as the sidebar's is (see WorkspaceMenu).
  icon?: string;
  // Its picture, when it has one.
  image?: string | null | undefined;
  // An action's icon, in the column of the workspace icons.
  glyph?: ReactNode;
  onPress: () => void;
  current?: boolean;
  hint?: ReactNode;
  testId?: string;
  title?: string;
}) {
  // A full-width row of the workspace menu (a dialog of plugin sections, not a react-aria Menu,
  // so no MenuItem), its ring inside so the popover's edge does not clip it.
  return (
    <button
      type="button"
      onClick={onPress}
      title={title}
      aria-current={current ? "true" : undefined}
      data-testid={testId}
      className={clsx(
        "flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-gray-700 hover:bg-gray-950/5",
        focusRingInsetClass,
        current && "font-medium text-gray-900",
      )}
    >
      {icon !== undefined && <SpaceIcon seed={icon} image={image} size={18} />}
      {glyph && (
        <span className="flex size-[18px] shrink-0 items-center justify-center text-base text-gray-500">
          {glyph}
        </span>
      )}
      <span className="min-w-0 grow truncate">{children}</span>
      {hint && <span className="max-w-[50%] shrink-0 truncate text-xs text-gray-400">{hint}</span>}
      {current && <CheckRegular aria-hidden className="size-4 shrink-0 text-gray-600" />}
    </button>
  );
}

function sameScope(a: WorkspaceScope, b: WorkspaceScope) {
  return a.kind === b.kind && (a.kind === "local" || a.workspaceId === b.workspaceId);
}

// Recent folders beyond this many stay on the desktop start screen.
const MAX_FOLDERS = 6;

// Where a folder is, for telling folders of the same name apart: "~/Documents" for
// "/Users/me/Documents/Notes", "…/Documents" when the parent is deeper.
function folderHint(path: string | undefined) {
  if (!path) return "Folder";
  const parent = (path.replace(/[/\\][^/\\]*$/, "") || "/").replace(
    /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=$|[/\\])/,
    "~",
  );
  const parts = parent.split(/[/\\]/);
  return parts.length > 2 ? `…/${parts.at(-1)}` : parent;
}

// The workspace switcher's list: this device's workspaces (this browser's, or recent folders on
// desktop) and the account's cloud ones, plus what makes one or copies this one to the cloud. Switching shows the other
// workspace in this window (a window's workspace is fixed, so the window reopens).
export function WorkspaceSection({ close }: { close: () => void }) {
  const app = useApp();
  const { api, state } = useAccount();
  const [hosted, setHosted] = useState<HostedWorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentImage = useWorkspaceImage();
  const signedIn = state.status === "signed-in";

  useEffect(() => {
    if (!api || !signedIn) return;
    let live = true;
    api
      .workspaces()
      .then((list) => live && setHosted(list))
      .catch((e: unknown) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [api, signedIn]);

  if (!api) return null;
  const go = (scope: WorkspaceScope) => {
    close();
    if (!sameScope(scope, api.scope)) void api.openScope(scope);
  };
  const open = (overlay: string, props?: unknown) => {
    close();
    app.overlays.open(overlay, props);
  };
  // The menu is gone by the time a switch fails, so the error is a toast.
  const run = (action: () => Promise<void>) => {
    close();
    action().catch((e: unknown) =>
      app.notify({
        title: "Could not open the workspace",
        description: errorMessage(e),
        kind: "error",
      }),
    );
  };
  const openFolder = api.openFolder;
  const local = api.localWorkspaces();
  const shown = local.filter((w, i) => i < MAX_FOLDERS || w.current);

  return (
    <div className="flex flex-col py-1" data-testid="workspace-list">
      <div className="px-3 pt-1 pb-1 text-xs font-medium text-gray-500">Workspaces</div>
      {shown.map((w) => (
        <Row
          key={w.id}
          current={w.current}
          hint={w.kind === "browser" ? "This browser" : folderHint(w.path)}
          onPress={() => (w.current ? close() : run(() => api.openLocalWorkspace(w.id)))}
          testId={`workspace-${w.kind}`}
          title={w.path}
          icon={w.name}
        >
          {w.name}
        </Row>
      ))}
      {api.scope.kind === "hosted" && !hosted && (
        <Row
          current
          onPress={close}
          hint="Cloud"
          icon={app.workspace.workspaceName}
          image={currentImage}
        >
          {app.workspace.workspaceName}
        </Row>
      )}
      {hosted?.map((w) => {
        const current = api.scope.kind === "hosted" && api.scope.workspaceId === w.id;
        return (
          <Row
            key={w.id}
            current={current}
            hint={w.role === "guest" ? "Guest" : "Cloud"}
            onPress={() => go({ kind: "hosted", workspaceId: w.id })}
            icon={w.name}
            // The list is fetched once; this window's picture is live.
            image={current ? currentImage : w.image}
          >
            {w.name}
          </Row>
        );
      })}
      {error && <p className="px-3 py-1 text-xs text-red-600">{error}</p>}
      {signedIn && (
        <Row glyph={<AddRegular />} onPress={() => open("account.createWorkspace")}>
          New cloud workspace…
        </Row>
      )}
      {openFolder && (
        <Row glyph={<FolderOpenRegular />} onPress={() => run(openFolder)} testId="open-folder">
          Open folder…
        </Row>
      )}
      {api.scope.kind === "local" && api.handoff && (
        <Row
          glyph={<CloudRegular />}
          onPress={() => open("account.handoff")}
          testId="copy-to-cloud"
        >
          {toCloud(api)}…
        </Row>
      )}
    </div>
  );
}

// The menu's last section, after Settings: sign in, or sign out as its last row.
export function AccountSection({ close }: { close: () => void }) {
  const app = useApp();
  const { api, state } = useAccount();
  if (!api) return null;
  const open = (overlay: string) => {
    close();
    app.overlays.open(overlay);
  };
  return (
    <div className="flex flex-col py-1">
      {state.status === "signed-out" ? (
        <Row glyph={<User3Regular />} onPress={() => open("account.signIn")}>
          Sign in…
        </Row>
      ) : (
        <>
          {state.status === "expired" && (
            <Row glyph={<User3Regular />} onPress={() => open("account.signIn")}>
              Sign in again…
            </Row>
          )}
          <Row
            glyph={<ExitRegular />}
            hint={state.user.email}
            onPress={() => {
              close();
              void api.signOut().then(() => app.notify({ title: "Signed out" }));
            }}
          >
            Sign out
          </Row>
        </>
      )}
    </div>
  );
}
