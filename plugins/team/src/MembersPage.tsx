import { useApp } from "@lydie/plugin-api";
import { useHostedQuery, useTeamspacesShown } from "@lydie/plugin-api/hosted";
import type { Invitation, Member, WorkspaceRole } from "@lydie/plugin-api/hosted";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Dialog,
  Heading,
  Modal,
  Select,
  SelectItem,
  SettingsCard,
  SettingsCardEmpty,
  SettingsCardHeader,
  SettingsDetailsList,
  SettingsDetailsPanel,
  SettingsListItem,
  SettingsSection,
  SettingsSections,
  TextField,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { FormEvent } from "react";

import {
  Avatar,
  errorText,
  HostedOnly,
  ROLE_LABELS,
  roleHelp,
  useMembers,
  useRefreshOnMemberChange,
  useRun,
} from "./shared.tsx";

type InviteRole = "admin" | "member" | "guest";

function InviteDialog({ close, onInvited }: { close: () => void; onInvited: () => void }) {
  const app = useApp();
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [spaces, setSpaces] = useState<string[]>([]);
  const shown = useTeamspacesShown();
  // New members join the default teamspaces; the others are offered only while teamspaces show.
  const teamspaces = useHostedQuery(
    "teamspace.list",
    shown ? { workspaceId: app.workspace.workspaceId } : null,
  );
  const extra = (teamspaces.data?.teamspaces ?? []).filter((t) => !t.isDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    const teamspaceIds = spaces.length && role !== "guest" ? { teamspaceIds: spaces } : {};
    for (const email of list) {
      try {
        await app.services!.account!.call("invitation.create", {
          workspaceId: app.workspace.workspaceId,
          email,
          role,
          ...teamspaceIds,
        });
      } catch (e) {
        failed.push(`${email}: ${errorText(e)}`);
      }
    }
    setBusy(false);
    onInvited();
    if (failed.length) {
      setError(failed.join("\n"));
      setEmails(failed.map((f) => f.split(":")[0]).join(", "));
      return;
    }
    app.notify({
      title:
        list.length === 1 ? `Invitation sent to ${list[0]}` : `${list.length} invitations sent`,
    });
    close();
  };
  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label="Invite people" className="p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            Invite people
          </Heading>
          <TextField
            label="Email addresses"
            description="Separate several with commas."
            isRequired
            value={emails}
            onChange={setEmails}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's first field
            autoFocus
          />
          <Select
            label="Role"
            selectedKey={role}
            onSelectionChange={(key) => setRole(key as InviteRole)}
            description={roleHelp(role, shown)}
          >
            <SelectItem id="member">Member</SelectItem>
            <SelectItem id="admin">Admin</SelectItem>
            <SelectItem id="guest">Guest</SelectItem>
          </Select>
          {role !== "guest" && extra.length > 0 && (
            <CheckboxGroup
              label="Also add to teamspaces"
              description="Default teamspaces are joined anyway."
              value={spaces}
              onChange={setSpaces}
            >
              {extra.map((t) => (
                <Checkbox key={t.id} value={t.id}>
                  {t.name}
                </Checkbox>
              ))}
            </CheckboxGroup>
          )}
          {error && (
            <p role="alert" className="text-sm whitespace-pre-line text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isPending={busy}>
              Send invitations
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}

function MemberDetails({
  member,
  me,
  close,
  reload,
  setMembers,
}: {
  member: Member;
  me: Member | null;
  close: () => void;
  reload: () => Promise<void>;
  setMembers: (update: (list: Member[]) => Member[]) => void;
}) {
  const app = useApp();
  const run = useRun();
  const shown = useTeamspacesShown();
  const api = app.services!.account!;
  const workspaceId = app.workspace.workspaceId;
  const self = me?.userId === member.userId;
  const isOwner = me?.role === "owner";
  // Only the owner manages admins; nobody changes the owner except by transferring ownership.
  const canChangeRole =
    !self &&
    member.role !== "owner" &&
    (isOwner || (me?.role === "admin" && member.role !== "admin"));
  const canRemove = canChangeRole;

  return (
    <SettingsDetailsPanel
      title={member.name || member.email}
      description={member.email}
      icon={<Avatar seed={member.userId} image={member.image} />}
      onClose={close}
      footer={
        <>
          {self && member.role !== "owner" && (
            <Button
              size="sm"
              variant="secondary"
              onPress={async () => {
                if (
                  !(await app.confirm({
                    message: "Leave this workspace?",
                    detail: "You lose access to its pages. Someone must invite you again.",
                    confirmLabel: "Leave",
                    destructive: true,
                  }))
                )
                  return;
                if (
                  await run("leave the workspace", () => api.call("member.leave", { workspaceId }))
                ) {
                  await api.openScope({ kind: "local", workspaceId: null });
                }
              }}
            >
              Leave workspace
            </Button>
          )}
          {canRemove && (
            <Button
              size="sm"
              variant="destructive"
              onPress={async () => {
                if (
                  !(await app.confirm({
                    message: `Remove ${member.name || member.email}?`,
                    detail: "Their private pages move to the workspace owner.",
                    confirmLabel: "Remove",
                    destructive: true,
                  }))
                )
                  return;
                const before = member;
                setMembers((list) => list.filter((m) => m.userId !== member.userId));
                close();
                const ok = await run("remove the member", () =>
                  api.call("member.remove", { workspaceId, userId: before.userId }),
                );
                if (!ok) await reload();
              }}
            >
              Remove from workspace
            </Button>
          )}
        </>
      }
    >
      <SettingsDetailsList>
        <dt>Role</dt>
        <dd>
          {canChangeRole ? (
            <Select
              aria-label="Role"
              selectedKey={member.role}
              onSelectionChange={async (key) => {
                const role = key as "admin" | "member" | "guest";
                if (role === member.role) return;
                setMembers((list) =>
                  list.map((m) => (m.userId === member.userId ? { ...m, role } : m)),
                );
                const ok = await run("change the role", () =>
                  api.call("member.setRole", { workspaceId, userId: member.userId, role }),
                );
                if (!ok) await reload();
              }}
            >
              {isOwner && <SelectItem id="admin">Admin</SelectItem>}
              <SelectItem id="member">Member</SelectItem>
              <SelectItem id="guest">Guest</SelectItem>
            </Select>
          ) : (
            ROLE_LABELS[member.role]
          )}
        </dd>
        <dt>Joined</dt>
        <dd>{new Date(member.createdAt).toLocaleDateString()}</dd>
      </SettingsDetailsList>
      <p className="text-xs text-gray-500">{roleHelp(member.role, shown)}.</p>
      {isOwner && !self && member.role !== "guest" && (
        <Button
          size="sm"
          variant="secondary"
          onPress={async () => {
            if (
              !(await app.confirm({
                message: `Make ${member.name || member.email} the owner?`,
                detail: "You become an admin. Only the new owner can give ownership back.",
                confirmLabel: "Transfer ownership",
                destructive: true,
              }))
            )
              return;
            if (
              await run("transfer ownership", () =>
                api.call("workspace.transferOwnership", { workspaceId, userId: member.userId }),
              )
            ) {
              app.notify({ title: "Ownership transferred" });
              await reload();
            }
          }}
        >
          Transfer ownership
        </Button>
      )}
    </SettingsDetailsPanel>
  );
}

function Invitations({ canManage }: { canManage: boolean }) {
  const app = useApp();
  const run = useRun();
  const api = app.services!.account!;
  const query = useHostedQuery(
    "invitation.list",
    canManage ? { workspaceId: app.workspace.workspaceId } : null,
  );
  // An accepted invitation shows up as a new synced member row.
  useRefreshOnMemberChange(query.reload, canManage);
  const [inviting, setInviting] = useState(false);
  if (!canManage) return null;
  const pending = (query.data?.invitations ?? []).filter((i) => i.status === "pending");
  const drop = (id: string) =>
    query.setData((d) => d && { invitations: d.invitations.filter((i) => i.id !== id) });
  return (
    <SettingsSection title="Invitations" description="People who have not accepted yet.">
      <SettingsCard data-testid="invitations">
        <SettingsCardHeader
          title={
            pending.length === 1 ? "1 pending invitation" : `${pending.length} pending invitations`
          }
          actions={
            <Button size="sm" onPress={() => setInviting(true)}>
              Invite people
            </Button>
          }
        />
        {query.error && !query.data && (
          <SettingsCardEmpty role="alert">
            {errorText(query.error)}
            <Button size="xs" variant="secondary" onPress={() => void query.reload()}>
              Retry
            </Button>
          </SettingsCardEmpty>
        )}
        {pending.map((invitation: Invitation) => (
          <SettingsListItem
            key={invitation.id}
            title={invitation.email}
            meta={[
              ROLE_LABELS[invitation.role],
              invitation.documentId ? "One page" : null,
              `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`,
            ]}
            trailing={
              <>
                <Button
                  size="xs"
                  variant="ghost"
                  onPress={async () => {
                    if (
                      await run("resend the invitation", () =>
                        api.call("invitation.resend", { invitationId: invitation.id }),
                      )
                    ) {
                      app.notify({ title: `Invitation sent again to ${invitation.email}` });
                      await query.reload();
                    }
                  }}
                >
                  Resend
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Revoke invitation for ${invitation.email}`}
                  onPress={async () => {
                    drop(invitation.id);
                    if (
                      !(await run("revoke the invitation", () =>
                        api.call("invitation.revoke", { invitationId: invitation.id }),
                      ))
                    )
                      await query.reload();
                  }}
                >
                  Revoke
                </Button>
              </>
            }
          />
        ))}
      </SettingsCard>
      {inviting && (
        <InviteDialog close={() => setInviting(false)} onInvited={() => void query.reload()} />
      )}
    </SettingsSection>
  );
}

export function MembersPage({
  path,
  navigate,
}: {
  path: string | null;
  navigate: (path: string | null) => void;
}) {
  return (
    <HostedOnly what="Members">
      <Members path={path} navigate={navigate} />
    </HostedOnly>
  );
}

function Members({
  path,
  navigate,
}: {
  path: string | null;
  navigate: (path: string | null) => void;
}) {
  const { members, me, canManage, error, isLoading, reload, setData } = useMembers();
  const open = members.find((m) => m.userId === path) ?? null;
  const order: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2, guest: 3 };
  const sorted = [...members].sort(
    (a, b) => order[a.role] - order[b.role] || (a.name || a.email).localeCompare(b.name || b.email),
  );
  return (
    <SettingsSections>
      <SettingsSection title="Members">
        <SettingsCard data-testid="members">
          <SettingsCardHeader
            title={members.length === 1 ? "1 member" : `${members.length} members`}
          />
          {isLoading && members.length === 0 && (
            <SettingsCardEmpty>Loading members…</SettingsCardEmpty>
          )}
          {error && members.length === 0 && (
            <SettingsCardEmpty role="alert">
              {errorText(error)}
              <Button size="xs" variant="secondary" onPress={() => void reload()}>
                Retry
              </Button>
            </SettingsCardEmpty>
          )}
          {sorted.map((m) => (
            <SettingsListItem
              key={m.userId}
              icon={<Avatar seed={m.userId} image={m.image} />}
              title={`${m.name || m.email}${m.userId === me?.userId ? " (you)" : ""}`}
              meta={[m.email, ROLE_LABELS[m.role]]}
              selected={open?.userId === m.userId}
              onPress={() => navigate(open?.userId === m.userId ? null : m.userId)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>
      <Invitations canManage={canManage} />
      {open && (
        <MemberDetails
          key={open.userId}
          member={open}
          me={me}
          close={() => navigate(null)}
          reload={reload}
          setMembers={(update) => setData((d) => d && { members: update(d.members) })}
        />
      )}
    </SettingsSections>
  );
}
