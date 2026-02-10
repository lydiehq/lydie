import { uint8ArrayToBase64 } from "@lydie/core/lib/base64";
import { mutators } from "@lydie/zero/mutators";
import { useCallback, useState } from "react";
import * as Y from "yjs";

import { useZero } from "@/services/zero";

export interface Version {
  id: string;
  document_id: string;
  user_id: string | null;
  title: string;
  yjs_state: string;
  version_number: number;
  change_description: string | null;
  created_at: number;
  updated_at: number;
  user?: {
    readonly id: string;
    readonly name: string;
    readonly image: string | null;
    readonly email?: string;
    readonly role?: string;
  } | undefined;
}

interface UseDocumentVersionsOptions {
  documentId: string;
  organizationId: string;
}

interface UseDocumentVersionsReturn {
  createVersion: (ydoc: Y.Doc, title: string, changeDescription?: string) => Promise<void>;
  restoreVersion: (version: Version, changeDescription?: string) => Promise<void>;
  deleteVersion: (versionId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useDocumentVersions({
  documentId,
  organizationId,
}: UseDocumentVersionsOptions): UseDocumentVersionsReturn {
  const z = useZero();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getYjsStateFromYDoc = useCallback((ydoc: Y.Doc): string => {
    const update = Y.encodeStateAsUpdate(ydoc);
    return uint8ArrayToBase64(update);
  }, []);

  const createVersion = useCallback(
    async (ydoc: Y.Doc, title: string, changeDescription?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const yjsState = getYjsStateFromYDoc(ydoc);

        await z.mutate(
          mutators.documentVersion.create({
            documentId,
            organizationId,
            title,
            yjsState,
            changeDescription,
          }),
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to create version";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [documentId, organizationId, z, getYjsStateFromYDoc],
  );

  const restoreVersion = useCallback(
    async (version: Version, changeDescription?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await z.mutate(
          mutators.documentVersion.restore({
            versionId: version.id,
            documentId,
            organizationId,
            changeDescription: changeDescription || `Restored to version ${version.version_number}`,
          }),
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to restore version";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [documentId, organizationId, z],
  );

  const deleteVersion = useCallback(
    async (versionId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await z.mutate(
          mutators.documentVersion.delete({
            versionId,
            documentId,
            organizationId,
          }),
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to delete version";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [documentId, organizationId, z],
  );

  return {
    createVersion,
    restoreVersion,
    deleteVersion,
    isLoading,
    error,
  };
}
