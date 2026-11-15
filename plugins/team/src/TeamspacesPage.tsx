import { useApp, useHostedQuery } from "@lydie/plugin-api";
import type { Teamspace, TeamspaceRole, TeamspaceVisibility } from "@lydie/plugin-api";
import {
  Button,
  Dialog,
  Heading,
  Modal,
  Select,
  SelectItem,
  SettingsCard,
  SettingsCardEmpty,
  SettingsCardHeader,
  SettingsDetailsPanel,
  SettingsListItem,
  SettingsRow,
  SettingsSection,
  SettingsTextInput,
  SpaceIcon,
  TextField,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { FormEvent } from "react";

import { Avatar, errorText, HostedOnly, useMembers, useRun } from "./shared.tsx";

export const VISIBILITY: Record<TeamspaceVisibility, { label: string; help: string }> = {
  open: { label: "Open", help: "Every member can see it, read its pages and join" },
  closed: { label: "Closed", help: "Everyone sees it exists; only its members read it" },
  private: { label: "Private", help: "Only its members know it exists" },
};

function CreateTeamspaceDialog({
  close,
  created,
}: {
  close: () => void;
  created: (teamspace: Teamspace) => void;
}) {
  const app = useApp();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<TeamspaceVisibility>("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      created(
        await app.services!.account!.call("teamspace.create", {
          workspaceId: app.workspace.workspaceId,
          name: name.trim(),
          visibility,
        }),
      );
      close();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label="New teamspace" className="p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            New teamspace
          </Heading>
          <TextField
            label="Name"
            isRequired
            value={name}
            onChange={setName}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's first field
            autoFocus
          />
          <Select
            label="Visibility"
            selectedKey={visibility}
            onSelectionChange={(key) => setVisibility(key as TeamspaceVisibility)}
            description={VISIBILITY[visibility].help}
          >
            {Object.entries(VISIBILITY).map(([id, v]) => (
              <SelectItem key={id} id={id}>
                {v.label}
              </SelectItem>
            ))}
          </Select>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isPending={busy} isDisabled={!name.trim()}>
              Create teamspace
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}

function TeamspaceDetails({
  teamspace,
  close,
  reloadList,
  deleted,
  patch,
}: {
  teamspace: Teamspace;
  close: () => void;
  reloadList: () => Promise<void>;
  patch: (changes: Partial<Teamspace> | null) => void;
  // After the server deleted it.
  deleted?: () => void;
}) {
  const app = useApp();
  const run = useRun();
  const api = app.services!.account!;
  const workspace = useMembers();
  const members = useHostedQuery("teamspace.listMembers", { teamspaceId: teamspace.id });
  const [adding, setAdding] = useState<string | null>(null);
  const isAdmin = workspace.canManage;
  const manages = isAdmin || teamspace.myRole === "owner";
  const list = members.data?.members ?? [];
  const outside = workspace.members.filter(
    (m) => m.role !== "guest" && !list.some((t) => t.userId === m.userId),
  );
  const teamspaceId = teamspace.id;

  const update = async (changes: { name?: string; visibility?: TeamspaceVisibility }) => {
    patch(changes);
    const ok = await run("update the teamspace", () =>
      api.call("teamspace.update", { teamspaceId, ...changes }),
    );
    if (!ok) await reloadList();
  };

  return (
    <SettingsDetailsPanel
      title={teamspace.name}
      description={VISIBILITY[teamspace.visibility].label}
      icon={<SpaceIcon seed={teamspace.id} size={32} />}
      onClose={close}
      footer={
        <>
          {teamspace.myRole === null && teamspace.visibility === "open" && (
            <Button
              size="sm"
              onPress={async () => {
                patch({ myRole: "member" });
                if (
                  await run("join the teamspace", () => api.call("teamspace.join", { teamspaceId }))
                ) {
                  await members.reload();
                } else await reloadList();
              }}
            >
              Join
            </Button>
          )}
          {teamspace.myRole !== null && (
            <Button
              size="sm"
              variant="secondary"
              onPress={async () => {
                patch({ myRole: null });
                if (
                  await run("leave the teamspace", () =>
                    api.call("teamspace.leave", { teamspaceId }),
                  )
                ) {
                  await members.reload();
                } else await reloadList();
              }}
            >
              Leave
            </Button>
          )}
          {manages && !teamspace.isDefault && (
            <Button
              size="sm"
              variant="destructive"
              onPress={async () => {
                if (
                  !(await app.confirm({
                    message: `Delete ${teamspace.name}?`,
                    detail: "Its pages go to the trash.",
                    confirmLabel: "Delete teamspace",
                    destructive: true,
                  }))
                )
                  return;
                patch(null);
                close();
                if (
                  await run("delete the teamspace", () =>
                    api.call("teamspace.delete", { teamspaceId }),
                  )
                )
                  deleted?.();
                else await reloadList();
              }}
            >
              Delete
            </Button>
          )}
        </>
      }
    >
      {manages && (
        <SettingsCard>
          <SettingsRow label="Name">
            <SettingsTextInput
              aria-label="Teamspace name"
              className="w-44"
              value={teamspace.name}
              required
              onSave={(name) => update({ name })}
            />
          </SettingsRow>
          <SettingsRow label="Visibility" description={VISIBILITY[teamspace.visibility].help}>
            <Select
              aria-label="Visibility"
              className="w-32"
              selectedKey={teamspace.visibility}
              onSelectionChange={(key) => void update({ visibility: key as TeamspaceVisibility })}
            >
              {Object.entries(VISIBILITY).map(([id, v]) => (
                <SelectItem key={id} id={id}>
                  {v.label}
                </SelectItem>
              ))}
            </Select>
          </SettingsRow>
        </SettingsCard>
      )}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-gray-900">
          {list.length === 1 ? "1 member" : `${list.length} members`}
        </h4>
        {members.error && !members.data && (
          <p role="alert" className="text-xs text-red-600">
            {errorText(members.error)}
          </p>
        )}
        <ul className="flex flex-col gap-1" aria-label="Teamspace members">
          {list.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm">
              <Avatar seed={m.userId} size={24} />
              <span className="min-w-0 grow truncate">{m.name || m.email}</span>
              {manages ? (
                <>
                  <Select
                    aria-label={`Role of ${m.name || m.email}`}
                    variant="ghost"
                    selectedKey={m.role}
                    onSelectionChange={async (key) => {
                      const role = key as TeamspaceRole;
                      members.setData(
                        (d) =>
                          d && {
                            members: d.members.map((x) =>
                              x.userId === m.userId ? { ...x, role } : x,
                            ),
                          },
                      );
                      if (
                        !(await run("change the role", () =>
                          api.call("teamspace.setMemberRole", {
                            teamspaceId,
                            userId: m.userId,
                            role,
                          }),
                        ))
                      )
                        await members.reload();
                    }}
                  >
                    <SelectItem id="owner">Owner</SelectItem>
                    <SelectItem id="member">Member</SelectItem>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${m.name || m.email} from the teamspace`}
                    onPress={async () => {
                      members.setData(
                        (d) => d && { members: d.members.filter((x) => x.userId !== m.userId) },
                      );
                      if (
                        !(await run("remove the member", () =>
                          api.call("teamspace.removeMember", { teamspaceId, userId: m.userId }),
                        ))
                      )
                        await members.reload();
                    }}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <span className="text-xs text-gray-500">
                  {m.role === "owner" ? "Owner" : "Member"}
                </span>
              )}
            </li>
          ))}
        </ul>
        {manages && outside.length > 0 && (
          <div className="flex items-end gap-2">
            <Select
              label="Add a member"
              size="sm"
              className="grow"
              selectedKey={adding}
              onSelectionChange={(key) => setAdding(String(key))}
            >
              {outside.map((m) => (
                <SelectItem key={m.userId} id={m.userId}>
                  {m.name || m.email}
                </SelectItem>
              ))}
            </Select>
            <Button
              size="sm"
              isDisabled={!adding}
              onPress={async () => {
                if (!adding) return;
                const userId = adding;
                setAdding(null);
                if (
                  await run("add the member", () =>
                    api.call("teamspace.addMember", { teamspaceId, userId }),
                  )
                ) {
                  await members.reload();
                }
              }}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    </SettingsDetailsPanel>
  );
}

export function TeamspacesPage({
  path,
  navigate,
}: {
  path: string | null;
  navigate: (path: string | null) => void;
}) {
  return (
    <HostedOnly what="Teamspaces">
      <Teamspaces path={path} navigate={navigate} />
    </HostedOnly>
  );
}

// Teamspaces in the trash, for admins: restore brings back the teamspace and its pages.
function DeletedTeamspaces({ restored }: { restored: () => void }) {
  const app = useApp();
  const run = useRun();
  const deleted = useHostedQuery("teamspace.list", {
    workspaceId: app.workspace.workspaceId,
    deleted: true,
  });
  const list = (deleted.data?.teamspaces ?? []).filter((t) => t.deletedAt);
  if (list.length === 0) return null;
  return (
    <SettingsCard data-testid="deleted-teamspaces">
      <SettingsCardHeader title="Deleted" />
      {list.map((t) => (
        <SettingsListItem
          key={t.id}
          icon={<SpaceIcon seed={t.id} size={32} className="opacity-50" />}
          title={t.name}
          meta={t.deletedAt ? `Deleted ${new Date(t.deletedAt).toLocaleDateString()}` : null}
          trailing={
            <Button
              size="xs"
              variant="secondary"
              aria-label={`Restore ${t.name}`}
              onPress={async () => {
                deleted.setData(
                  (d) => d && { teamspaces: d.teamspaces.filter((x) => x.id !== t.id) },
                );
                if (
                  await run("restore the teamspace", () =>
                    app.services!.account!.call("teamspace.restore", { teamspaceId: t.id }),
                  )
                ) {
                  app.notify({ title: `Restored ${t.name}` });
                  restored();
                } else await deleted.reload();
              }}
            >
              Restore
            </Button>
          }
        />
      ))}
    </SettingsCard>
  );
}

function Teamspaces({
  path,
  navigate,
}: {
  path: string | null;
  navigate: (path: string | null) => void;
}) {
  const app = useApp();
  const workspace = useMembers();
  const query = useHostedQuery("teamspace.list", { workspaceId: app.workspace.workspaceId });
  const [creating, setCreating] = useState(false);
  // Bumped after a delete, so the deleted list loads again.
  const [trashVersion, setTrashVersion] = useState(0);
  const list = query.data?.teamspaces ?? [];
  const open = list.find((t) => t.id === path) ?? null;
  const canCreate = workspace.me !== null && workspace.me.role !== "guest";
  const patch = (id: string, changes: Partial<Teamspace> | null) =>
    query.setData(
      (d) =>
        d && {
          teamspaces: changes
            ? d.teamspaces.map((t) => (t.id === id ? { ...t, ...changes } : t))
            : d.teamspaces.filter((t) => t.id !== id),
        },
    );
  return (
    <SettingsSection
      title="Teamspaces"
      description="Groups of pages for a team. New members join the default ones."
    >
      <SettingsCard data-testid="teamspaces">
        <SettingsCardHeader
          title={list.length === 1 ? "1 teamspace" : `${list.length} teamspaces`}
          actions={
            canCreate && (
              <Button size="sm" onPress={() => setCreating(true)}>
                New teamspace
              </Button>
            )
          }
        />
        {query.isLoading && list.length === 0 && (
          <SettingsCardEmpty>Loading teamspaces…</SettingsCardEmpty>
        )}
        {query.error && list.length === 0 && (
          <SettingsCardEmpty role="alert">
            {errorText(query.error)}
            <Button size="xs" variant="secondary" onPress={() => void query.reload()}>
              Retry
            </Button>
          </SettingsCardEmpty>
        )}
        {list.map((t) => (
          <SettingsListItem
            key={t.id}
            icon={<SpaceIcon seed={t.id} size={32} />}
            title={t.name}
            meta={[
              VISIBILITY[t.visibility].label,
              t.isDefault ? "Default" : null,
              t.myRole === "owner" ? "You own it" : t.myRole === "member" ? "Joined" : "Not joined",
            ]}
            selected={open?.id === t.id}
            onPress={() => navigate(open?.id === t.id ? null : t.id)}
          />
        ))}
      </SettingsCard>
      {workspace.canManage && (
        // Remounts (and reloads) after a delete.
        <DeletedTeamspaces key={trashVersion} restored={() => void query.reload()} />
      )}
      {open && (
        <TeamspaceDetails
          key={open.id}
          teamspace={open}
          close={() => navigate(null)}
          reloadList={query.reload}
          patch={(changes) => patch(open.id, changes)}
          deleted={() => setTrashVersion((v) => v + 1)}
        />
      )}
      {creating && (
        <CreateTeamspaceDialog
          close={() => setCreating(false)}
          created={(t) => {
            query.setData((d) => d && { teamspaces: [...d.teamspaces, t] });
            navigate(t.id);
          }}
        />
      )}
    </SettingsSection>
  );
}
