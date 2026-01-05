import { useDebounceCallback } from "usehooks-ts";
import { useZero } from "@/services/zero";
import { mutators } from "@lydie/zero/mutators";
import { useOrganization } from "@/context/organization.context";

export function useAutoSave({
  documentId,
  debounceMs = 500,
}: {
  documentId: string;
  debounceMs?: number;
}) {
  const z = useZero();
  const { organization } = useOrganization();

  // Simple debounced save using Zero's optimistic mutations
  // The server-side mutator will automatically trigger embedding generation
  // with a delay after this update is synced
  // Content is auto-synced by Yjs, so we only need to save title
  const debouncedSave = useDebounceCallback((data: { title?: string }) => {
    z.mutate(
      mutators.document.update({
        documentId,
        ...(data.title !== undefined && { title: data.title }),
        indexStatus: "outdated", // Mark as needing re-indexing
        organizationId: organization.id,
      })
    );
  }, debounceMs);

  return {
    saveDocument: debouncedSave,
  };
}
