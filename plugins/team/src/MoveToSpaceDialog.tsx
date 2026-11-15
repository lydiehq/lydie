import { useAccount, useApp, useHostedQuery, useQuery } from "@lydie/plugin-api";
import type { DocumentRef } from "@lydie/plugin-api";
import {
  Button,
  Dialog,
  Heading,
  LoadingState,
  Modal,
  Radio,
  RadioGroup,
  SpaceIcon,
} from "@lydie/plugin-api/ui";
import { useState } from "react";

import { errorText } from "./shared.tsx";

const PRIVATE = "__private";

// "Move to teamspace" (only while teamspaces show): moves a top-level page (and everything under
// it) to a teamspace the user is in or to their private section. Needs full access to the page.
export function MoveToSpaceDialog({ close, props }: { close: () => void; props: unknown }) {
  const app = useApp();
  const doc = props as DocumentRef;
  const spaces = useHostedQuery("teamspace.list", { workspaceId: app.workspace.workspaceId });
  // The page's top-level entry says which space it is in.
  const current = useQuery("doc.children", {
    workspaceId: app.workspace.workspaceId,
    parentId: null,
  }).data.find((d) => d.id === doc.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joined = (spaces.data?.teamspaces ?? []).filter((t) => t.myRole !== null);
  const { state } = useAccount();
  const me = state.status === "signed-out" ? null : state.user.id;
  // Someone else's private page (shared with full access) is not in the user's Private.
  const here = !current
    ? null
    : (current.teamspaceId ??
      (current.privateOwnerId && current.privateOwnerId !== me ? null : PRIVATE));
  // Somewhere else than where the page is.
  const target =
    picked ?? [...joined.map((t) => t.id), PRIVATE].find((id) => id !== here) ?? PRIVATE;
  const nameOf = (id: string) => joined.find((t) => t.id === id)?.name ?? "Private";
  const move = async () => {
    setBusy(true);
    setError(null);
    try {
      await app.services!.account!.call("doc.moveToSpace", {
        id: doc.id,
        teamspaceId: target === PRIVATE ? null : target,
      });
      app.notify({ title: `Moved “${doc.title || "Untitled"}” to ${nameOf(target)}` });
      close();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label="Move to teamspace" className="flex flex-col gap-3 p-5">
        <Heading slot="title" className="text-base font-medium text-gray-900">
          Move “{doc.title || "Untitled"}”
        </Heading>
        <p className="text-sm text-gray-600">
          The page and everything under it move. Who can see them follows the new place.
        </p>
        {spaces.isLoading && !spaces.data ? (
          <LoadingState label="Loading teamspaces" />
        ) : (
          <RadioGroup aria-label="Move to" value={target} onChange={setPicked}>
            {joined.map((t) => (
              <Radio key={t.id} value={t.id}>
                <span className="flex items-center gap-1.5">
                  <SpaceIcon seed={t.id} size={16} />
                  {t.name}
                </span>
              </Radio>
            ))}
            <Radio value={PRIVATE}>Private (only you)</Radio>
          </RadioGroup>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onPress={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            onPress={() => void move()}
            isPending={busy}
            isDisabled={target === here}
          >
            Move
          </Button>
        </div>
      </Dialog>
    </Modal>
  );
}
