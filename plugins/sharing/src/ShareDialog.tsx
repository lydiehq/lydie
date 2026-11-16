import {
  spaceName,
  useAccount,
  useApp,
  useHostedQuery,
  useQuery,
  useTeamspacesShown,
  useWorkspaceImage,
} from "@lydie/plugin-api";
import type { AccessLevel, DocumentGrant, PrincipalType } from "@lydie/plugin-api";
import {
  Avatar,
  Button,
  Dialog,
  dropdownItemStyles,
  ErrorState,
  focusRingClass,
  Heading,
  Input,
  LoadingState,
  Modal,
  Select,
  SelectItem,
  SpaceIcon,
  Switch,
} from "@lydie/plugin-api/ui";
import { useId, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { atLeast, errorText, LEVELS } from "./errors.ts";
import { matchesWords, suggestPeople } from "./match.ts";
import { PublicLinks } from "./PublicLinks.tsx";

export type ShareProps = { documentId: string; title: string };

type Candidate = {
  type: PrincipalType;
  id: string;
  label: string;
  detail: string;
  image?: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LevelSelect({
  value,
  onChange,
  label,
  isDisabled,
  allowRemove,
  variant = "field",
  size,
}: {
  value: AccessLevel;
  onChange: (level: AccessLevel | "remove") => void;
  label: string;
  isDisabled?: boolean;
  allowRemove?: boolean;
  // `ghost` in a list row, beside the name it belongs to.
  variant?: "field" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <Select
      aria-label={label}
      variant={variant}
      size={size}
      className={variant === "field" ? "w-36" : undefined}
      isDisabled={isDisabled}
      selectedKey={value}
      onSelectionChange={(key) => onChange(key as AccessLevel | "remove")}
    >
      {[
        ...Object.entries(LEVELS).map(([id, l]) => (
          <SelectItem key={id} id={id}>
            {l.label}
          </SelectItem>
        )),
        ...(allowRemove
          ? [
              <SelectItem key="remove" id="remove">
                Remove
              </SelectItem>,
            ]
          : []),
      ]}
    </Select>
  );
}

// The Share dialog of a page: who has access (directly, or inherited from a parent page, a
// teamspace or the whole workspace), adding people, teamspaces or email addresses, the
// "restricted" switch, and public links. Changing anything needs full access. While teamspaces are
// hidden (`teamspacesShown`) none are offered, and a grant to the default one reads "Workspace".
export function ShareDialog({ close, props }: { close: () => void; props: unknown }) {
  const app = useApp();
  const { state } = useAccount();
  const { documentId, title } = props as ShareProps;
  const api = app.services!.account!;
  const workspaceId = app.workspace.workspaceId;
  const workspaceImage = useWorkspaceImage();
  const sharing = useHostedQuery("share.get", { documentId });
  // The synced member rows: live, so someone who joined while the dialog is open is offered,
  // and only the people this user may see in the members list (a guest gets none but their own).
  const memberRows = useQuery("workspace.members", { workspaceId });
  const spaces = useHostedQuery("teamspace.list", { workspaceId });
  const shown = useTeamspacesShown();
  const findOrAdd = shown ? "Add people, teamspaces or emails" : "Add people or emails";
  const [query, setQueryState] = useState("");
  const [active, setActive] = useState(0);
  // Arrows moved to a suggestion: Enter picks it even when an address is typed.
  const [navigated, setNavigated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const setQuery = (next: string) => {
    setQueryState(next);
    setActive(0);
    setNavigated(false);
    setDismissed(false);
  };
  const [level, setLevel] = useState<AccessLevel>("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const info = sharing.data;
  const canManage = atLeast(info?.myLevel, "full");
  const meId = state.status === "signed-out" ? null : state.user.id;
  const people = memberRows.data
    .filter((m) => m.workspaceId === workspaceId)
    .map((m) => ({ userId: m.userId, name: m.userName, email: m.userEmail, image: m.userImage }));
  const memberName = (id: string) => {
    const m = people.find((x) => x.userId === id);
    const p = info?.people.find((x) => x.userId === id);
    return m?.name || m?.email || p?.name || p?.email || "Someone";
  };
  const spaceNameOf = (id: string) => {
    const space = spaces.data?.teamspaces.find((t) => t.id === id);
    return space ? spaceName(space, shown) : shown ? "A teamspace" : "Workspace";
  };
  const principalName = (g: DocumentGrant) =>
    g.principalType === "workspace"
      ? `Everyone at ${app.workspace.workspaceName}`
      : g.principalType === "teamspace"
        ? spaceNameOf(g.principalId)
        : memberName(g.principalId);
  const principalIcon = (g: DocumentGrant) =>
    g.principalType === "user" ? (
      <Avatar seed={g.principalId} size={20} />
    ) : (
      <SpaceIcon
        seed={g.principalType === "workspace" ? app.workspace.workspaceName : g.principalId}
        image={g.principalType === "workspace" ? workspaceImage : null}
        size={20}
      />
    );

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await sharing.reload();
      return true;
    } catch (e) {
      setError(`Could not ${label}: ${errorText(e)}`);
      await sharing.reload();
      return false;
    }
  };

  const granted = new Set((info?.grants ?? []).map((g) => `${g.principalType}:${g.principalId}`));
  const exclude = new Set([
    ...(meId ? [meId] : []),
    ...(info?.grants ?? []).filter((g) => g.principalType === "user").map((g) => g.principalId),
  ]);
  const candidates: Candidate[] = query.trim()
    ? [
        ...suggestPeople(people, query, exclude).map((m) => ({
          type: "user" as const,
          id: m.userId,
          label: m.name || m.email || "Someone",
          detail: m.email ?? "",
          image: m.image,
        })),
        ...(shown ? (spaces.data?.teamspaces ?? []) : [])
          .filter((t) => !granted.has(`teamspace:${t.id}`) && matchesWords(query, t.name))
          .map((t) => ({
            type: "teamspace" as const,
            id: t.id,
            label: t.name,
            detail: "Teamspace",
          })),
        ...(matchesWords(query, "everyone", app.workspace.workspaceName) &&
        !granted.has(`workspace:${workspaceId}`)
          ? [
              {
                type: "workspace" as const,
                id: workspaceId,
                label: `Everyone at ${app.workspace.workspaceName}`,
                detail: "Members, not guests",
              },
            ]
          : []),
      ].slice(0, 6)
    : [];

  const open = candidates.length > 0 && !dismissed;
  const index = Math.min(active, Math.max(0, candidates.length - 1));
  const highlighted = open ? candidates[index] : undefined;

  const grant = async (c: Candidate) => {
    setBusy(true);
    const ok = await run("share the page", () =>
      api.call("share.grant", { documentId, principalType: c.type, principalId: c.id, level }),
    );
    setBusy(false);
    if (ok) {
      setQuery("");
      app.notify({ title: `Shared with ${c.label}` });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (candidates.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(dismissed ? 0 : (index + step + candidates.length) % candidates.length);
      setNavigated(true);
      setDismissed(false);
    } else if (event.key === "Escape" && open) {
      // Closes the suggestions first, then (a second Escape) the dialog.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  };

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const email = query.trim();
    // A typed address is invited (as before) unless the arrows picked a suggestion.
    if (highlighted && (navigated || !EMAIL.test(email))) return void grant(highlighted);
    if (!EMAIL.test(email)) {
      setError(`Enter an email address, or pick a person${shown ? " or teamspace" : ""}.`);
      return;
    }
    setBusy(true);
    setError(null);
    // A promise chain rather than try/finally, which the React Compiler cannot compile.
    const attempt = async () => {
      const result = await api.call("share.invite", { documentId, email, level });
      app.notify({
        title:
          result.status === "invited"
            ? `Invitation sent to ${email}`
            : result.status === "added_as_guest"
              ? `${email} was added as a guest`
              : `Shared with ${email}`,
      });
      setQuery("");
      await sharing.reload();
    };
    await attempt()
      .catch((e: unknown) => setError(`Could not invite ${email}: ${errorText(e)}`))
      .finally(() => setBusy(false));
  };

  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="lg">
      <Dialog aria-label={`Share ${title || "Untitled"}`} className="flex max-h-[80vh] flex-col">
        <div className="flex items-center gap-2 border-b border-gray-950/5 px-5 py-3">
          <Heading slot="title" className="grow truncate text-base font-medium text-gray-900">
            Share “{title || "Untitled"}”
          </Heading>
          <Button size="sm" variant="ghost" onPress={close}>
            Done
          </Button>
        </div>
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
          {!info && sharing.isLoading && <LoadingState />}
          {!info && sharing.error && (
            <ErrorState title="Could not load who has access" error={errorText(sharing.error)} />
          )}
          {info && (
            <>
              {canManage ? (
                <form onSubmit={(event) => void invite(event)} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {/* sm throughout, the Invite button's height. */}
                    {/* Focus stays in the field, which drives the suggestions below through
                        aria-activedescendant (as the person property's picker does). */}
                    <Input
                      size="sm"
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an ARIA combobox (no native one)
                      role="combobox"
                      aria-label={findOrAdd}
                      aria-autocomplete="list"
                      aria-expanded={open}
                      aria-controls={open ? listId : undefined}
                      aria-activedescendant={open ? `${listId}-${index}` : undefined}
                      autoComplete="off"
                      placeholder={findOrAdd}
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      onKeyDown={onKeyDown}
                      className="grow"
                    />
                    <LevelSelect
                      label="Access for new people"
                      size="sm"
                      value={level}
                      onChange={(l) => l !== "remove" && setLevel(l)}
                    />
                    <Button type="submit" size="sm" isPending={busy} isDisabled={!query.trim()}>
                      Invite
                    </Button>
                  </div>
                  {open && (
                    <div
                      id={listId}
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the combobox's popup
                      role="listbox"
                      aria-label="Suggestions"
                      className="flex flex-col rounded-md p-1 ring ring-gray-950/8"
                    >
                      {candidates.map((c, i) => (
                        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- keys and focus stay in the combobox
                        <div
                          key={`${c.type}:${c.id}`}
                          id={`${listId}-${i}`}
                          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the ARIA listbox
                          role="option"
                          aria-selected={i === index}
                          data-active={i === index || undefined}
                          onMouseEnter={() => setActive(i)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => void grant(c)}
                          className={dropdownItemStyles({
                            isFocused: i === index,
                            className: "gap-2",
                          })}
                        >
                          {c.type === "user" ? (
                            <Avatar seed={c.id} image={c.image} size={20} />
                          ) : (
                            <SpaceIcon
                              seed={c.type === "workspace" ? app.workspace.workspaceName : c.id}
                              image={c.type === "workspace" ? workspaceImage : null}
                              size={20}
                            />
                          )}
                          <span className="min-w-0 grow truncate">{c.label}</span>
                          <span className="min-w-0 shrink truncate text-xs text-gray-500">
                            {c.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {EMAIL.test(query.trim()) &&
                    !navigated &&
                    !people.some((m) => m.email?.toLowerCase() === query.trim().toLowerCase()) && (
                      <p className="text-xs text-gray-500">
                        Press Enter to invite {query.trim()}. Someone outside the workspace joins as
                        a guest and sees only this page.
                      </p>
                    )}
                </form>
              ) : (
                <p className="rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                  You have {LEVELS[info.myLevel].label.toLowerCase().replace("can ", "")} access.
                  Ask someone with full access to share this page.
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <section aria-label="People with access" className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-gray-500">People with access</h3>
                <ul className="flex flex-col" data-testid="share-people">
                  {info.people.map((p) => (
                    <li key={p.userId} className="flex items-center gap-2 py-1 text-sm">
                      <Avatar seed={p.userId} size={20} />
                      <span className="min-w-0 grow truncate">
                        {p.name || p.email}
                        {p.userId === meId ? " (you)" : ""}
                        <span className="ml-2 text-xs text-gray-400">{p.email}</span>
                      </span>
                      <span className="text-xs text-gray-500">{LEVELS[p.level].label}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {info.grants.length > 0 && (
                <section aria-label="Shared directly" className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium text-gray-500">Shared on this page</h3>
                  <ul className="flex flex-col" data-testid="share-grants">
                    {info.grants.map((g) => (
                      <li key={g.id} className="flex items-center gap-2 py-1 text-sm">
                        {principalIcon(g)}
                        <span className="min-w-0 grow truncate">{principalName(g)}</span>
                        <LevelSelect
                          label={`Access for ${principalName(g)}`}
                          value={g.level}
                          isDisabled={!canManage}
                          allowRemove
                          variant="ghost"
                          onChange={(next) =>
                            void (next === "remove"
                              ? run("remove access", () =>
                                  api.call("share.revoke", { documentId, grantId: g.id }),
                                )
                              : run("change access", () =>
                                  api.call("share.grant", {
                                    documentId,
                                    principalType: g.principalType,
                                    principalId: g.principalId,
                                    level: next,
                                  }),
                                ))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {info.inherited.length > 0 && !info.restricted && (
                <section aria-label="Inherited access" className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium text-gray-500">From pages above</h3>
                  <ul className="flex flex-col">
                    {info.inherited.flatMap((source) =>
                      source.grants.map((g) => (
                        <li
                          key={`${source.documentId}:${g.id}`}
                          className="flex items-center gap-2 py-1 text-sm"
                        >
                          <span className="min-w-0 grow truncate">
                            {principalName(g)}
                            {/* Opens the page, so it reads as a link (Link's secondary look). */}
                            <button
                              type="button"
                              className={`ml-2 rounded-xs text-xs text-gray-400 underline decoration-gray-400/50 hover:decoration-gray-400 ${focusRingClass}`}
                              onClick={() => {
                                close();
                                app.openDoc(source.documentId);
                              }}
                            >
                              from {source.title || "Untitled"}
                            </button>
                          </span>
                          <span className="text-xs text-gray-500">{LEVELS[g.level].label}</span>
                        </li>
                      )),
                    )}
                  </ul>
                </section>
              )}

              <section aria-label="General access" className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-gray-500">General access</h3>
                <Switch
                  isSelected={info.restricted}
                  isDisabled={!canManage}
                  onChange={(restricted) =>
                    void run(restricted ? "restrict the page" : "lift the restriction", () =>
                      api.call("share.setRestricted", { documentId, restricted }),
                    )
                  }
                >
                  Restricted: only the people listed above, nothing inherited from{" "}
                  {info.teamspaceId
                    ? `the ${shown ? "teamspace" : "workspace"} or pages above`
                    : "pages above"}
                </Switch>
              </section>

              <section aria-label="Publish to web" className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-gray-500">Publish to web</h3>
                <PublicLinks
                  documentId={documentId}
                  canManage={canManage}
                  openPage={(id) => {
                    close();
                    app.openDoc(id);
                  }}
                />
              </section>
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
