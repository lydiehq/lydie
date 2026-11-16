import { belowBase, parseAppUrl } from "@lydie/app/url";
import { isUuid } from "@lydie/contract";
import type { WorkspaceScope } from "@lydie/plugin-api/hosted";

export const LOCAL: WorkspaceScope = { kind: "local", workspaceId: null };

// The workspace a URL names: a hosted one under `w/<slug or id>/` (its `workspaceId` is what the
// URL says, to be resolved), this browser's own for any other page. Null at the app's base, which
// opens the workspace opened last.
export function linkedScope(base: string, pathname: string): WorkspaceScope | null {
  const below = belowBase(base, pathname);
  if (!below) return null;
  const { workspace } = parseAppUrl(below);
  return workspace ? { kind: "hosted", workspaceId: workspace } : LOCAL;
}

export type ScopeDecision = {
  scope: WorkspaceScope;
  // A hosted workspace that needs a sign-in first: offered over this browser's workspace. Named
  // as the URL or the preference names it (a slug is resolved once signed in).
  wanted: WorkspaceScope | null;
  // Why the workspace the URL names is not the one that opens.
  notice: string | null;
};

// Which workspace a window opens: the one its URL names, else the one opened last.
export async function decideScope(input: {
  linked: WorkspaceScope | null;
  preferred: WorkspaceScope | null;
  // Asked only for a hosted workspace.
  signedIn: () => Promise<boolean>;
  // The id of a workspace the signed-in user can open, from its slug or id; null when there is
  // none. A workspace this browser has listed before answers without the network.
  resolve: (ref: string) => Promise<string | null>;
}): Promise<ScopeDecision> {
  const { linked, preferred } = input;
  const named = linked ?? preferred ?? LOCAL;
  if (named.kind !== "hosted") return { scope: LOCAL, wanted: null, notice: null };
  if (!(await input.signedIn())) return { scope: LOCAL, wanted: named, notice: null };
  // The workspace opened last is taken at its word (it opens offline); a link is looked up.
  const last = async (): Promise<WorkspaceScope> => {
    if (preferred?.kind !== "hosted") return LOCAL;
    const ref = preferred.workspaceId;
    const id = isUuid(ref) ? ref : await input.resolve(ref);
    return id ? { kind: "hosted", workspaceId: id } : LOCAL;
  };
  if (!linked) return { scope: await last(), wanted: null, notice: null };
  const id = await input.resolve(named.workspaceId);
  if (id) return { scope: { kind: "hosted", workspaceId: id }, wanted: null, notice: null };
  return {
    scope: await last(),
    wanted: null,
    notice: "That workspace is not one of yours, or could not be reached",
  };
}
