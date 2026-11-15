// The parts of a synced `workspace.members` row that the Members page shows.
type MemberRow = {
  userId: string;
  role: string;
  userName: string | null;
  userEmail: string | null;
  userImage: string | null;
};

// Who is in, with which role, name and picture. A change means someone joined (an invitation
// was accepted), left or was changed, so the page's API lists are out of date.
export function membersSignature(rows: readonly MemberRow[]): string {
  return rows
    .map((m) =>
      [m.userId, m.role, m.userName ?? "", m.userEmail ?? "", m.userImage ?? ""].join(":"),
    )
    .sort()
    .join("|");
}

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

// Calls `run` when the person comes back to the window (focus, or the tab shown again): what
// does not sync, such as invitations made or revoked elsewhere, is fetched again then. Focus and
// visibility often fire together; one call per `gapMs`.
export function onReturn(
  run: () => void,
  {
    window: win,
    document: doc,
    gapMs = 1000,
    now = Date.now,
  }: {
    window: Target;
    document: Target & { visibilityState: string };
    gapMs?: number;
    now?: () => number;
  },
): () => void {
  let last = Number.NEGATIVE_INFINITY;
  const handle = () => {
    if (doc.visibilityState !== "visible") return;
    const at = now();
    if (at - last < gapMs) return;
    last = at;
    run();
  };
  win.addEventListener("focus", handle);
  doc.addEventListener("visibilitychange", handle);
  return () => {
    win.removeEventListener("focus", handle);
    doc.removeEventListener("visibilitychange", handle);
  };
}
