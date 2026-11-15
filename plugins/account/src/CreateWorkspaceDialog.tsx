import { useAccount } from "@lydie/plugin-api";
import { Button, Dialog, Heading, Modal, TextField } from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { FormEvent } from "react";

import { errorMessage } from "./format.ts";

// A new hosted workspace with a Getting started page; the window reopens on it.
export function CreateWorkspaceDialog({ close }: { close: () => void; props: unknown }) {
  const { api } = useAccount();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!api) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createWorkspace({ name: name.trim(), gettingStarted: true });
      await api.openScope({ kind: "hosted", workspaceId: created.id });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
      <Dialog aria-label="New cloud workspace" className="p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            New cloud workspace
          </Heading>
          <p className="text-sm text-gray-600">
            A workspace in Lydie Cloud: it syncs across your devices and you can invite people to
            it. It starts with a short Getting started page.
          </p>
          <p className="text-xs text-gray-500">Lydie Cloud is free for now. Fair use applies.</p>
          <TextField
            label="Name"
            isRequired
            value={name}
            onChange={setName}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog's only field
            autoFocus
          />
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
              Create workspace
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}
