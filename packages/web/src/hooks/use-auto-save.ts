import { useDebounceCallback } from "usehooks-ts";
import { useZero } from "@/services/zero";
import { mutators } from "@lydie/zero/mutators";

export function useAutoSave({
  documentId,
  debounceMs = 500,
}: {
  documentId: string;
  debounceMs?: number;
}) {
  const z = useZero();

  // Simple debounced save using Zero's optimistic mutations
  // The server-side mutator will automatically trigger embedding generation
  // with a delay after this update is synced
  const debouncedSave = useDebounceCallback(
    (data: { title?: string; json_content?: any }) => {
      z.mutate(
        mutators.document.update({
          documentId,
          ...(data.title !== undefined && { title: data.title }),
          ...(data.json_content !== undefined && {
            jsonContent: data.json_content,
          }),
          indexStatus: "outdated", // Mark as needing re-indexing
        })
      );
    },
    debounceMs
  );

  return {
    saveDocument: debouncedSave,
  };
}
