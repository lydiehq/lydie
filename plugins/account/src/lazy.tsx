// The dialogs and the Account page are not needed to show the workspace: each loads on first use,
// and all of them are fetched once the app is idle after start, so opening one rarely waits.
// Each brings its own Suspense: an overlay or a settings page has none around it.
import { lazy, Suspense } from "react";
import type { ComponentType } from "react";

type OverlayProps = { close: () => void; props: unknown };
type PageProps = { path: string | null; navigate(path: string | null): void };

const loads = {
  signIn: () => import("./SignInDialog.tsx").then((m) => m.SignInDialog),
  handoff: () => import("./HandoffDialog.tsx").then((m) => m.HandoffDialog),
  createWorkspace: () => import("./CreateWorkspaceDialog.tsx").then((m) => m.CreateWorkspaceDialog),
  accountPage: () => import("./AccountPage.tsx").then((m) => m.AccountPage),
};

function deferred<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Loaded = lazy(() => load().then((component) => ({ default: component })));
  return function Deferred(props: P) {
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  };
}

export const SignInDialog = deferred<OverlayProps>(loads.signIn);
export const HandoffDialog = deferred<OverlayProps>(loads.handoff);
export const CreateWorkspaceDialog = deferred<OverlayProps>(loads.createWorkspace);
export const AccountPage = deferred<PageProps>(loads.accountPage);

export function preloadAccountUi(): void {
  const idle =
    (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ??
    ((fn: () => void) => setTimeout(fn, 1500));
  idle(() => {
    for (const load of Object.values(loads)) void load().catch(() => {});
  });
}
