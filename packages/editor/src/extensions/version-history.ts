import { Extension } from "@tiptap/core";
import type { Editor, RawCommands } from "@tiptap/core";
import * as Y from "yjs";

export interface VersionHistoryOptions {
  ydoc?: Y.Doc;
  documentId: string;
  organizationId: string;
  onCreateVersion?: (version: {
    documentId: string;
    title: string;
    yjsState: string;
    changeDescription?: string;
  }) => Promise<void>;
  onRestoreVersion?: (versionId: string, changeDescription?: string) => Promise<void>;
  autoVersioning?: boolean;
  autoVersioningInterval?: number; // in seconds
}

export interface VersionHistoryStorage {
  versions: Array<{
    id: string;
    versionNumber: number;
    title: string;
    changeDescription?: string;
    createdAt: number;
    userId?: string;
  }>;
  currentVersion: number;
  latestVersion: number;
  autoVersioningEnabled: boolean;
  lastSavedAt?: Date;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    versionHistory: {
      saveVersion: (title?: string, changeDescription?: string) => ReturnType;
      toggleAutoVersioning: () => ReturnType;
      restoreVersion: (versionId: string, changeDescription?: string) => ReturnType;
      previewVersion: (yjsState: string) => ReturnType;
      exitPreview: () => ReturnType;
    };
  }
}

// Store intervals globally to avoid TypeScript issues
const autoVersioningIntervals = new WeakMap<Editor, NodeJS.Timeout>();

export const VersionHistory = Extension.create<VersionHistoryOptions, VersionHistoryStorage>({
  name: "versionHistory",

  addOptions() {
    return {
      documentId: "",
      organizationId: "",
      autoVersioning: false,
      autoVersioningInterval: 300, // 5 minutes default
    };
  },

  addStorage() {
    return {
      versions: [],
      currentVersion: 0,
      latestVersion: 0,
      autoVersioningEnabled: false,
      lastSavedAt: undefined,
    };
  },

  onCreate() {
    if (this.options.autoVersioning) {
      this.storage.autoVersioningEnabled = true;
      
      const intervalMs = (this.options.autoVersioningInterval || 300) * 1000;
      
      const existingInterval = autoVersioningIntervals.get(this.editor);
      if (existingInterval) {
        clearInterval(existingInterval);
      }

      const interval = setInterval(() => {
        if (this.editor.isDestroyed) {
          const int = autoVersioningIntervals.get(this.editor);
          if (int) clearInterval(int);
          autoVersioningIntervals.delete(this.editor);
          return;
        }

        const { ydoc } = this.options;
        if (ydoc) {
          this.editor.commands.saveVersion(undefined, "Auto-saved version");
        }
      }, intervalMs);

      autoVersioningIntervals.set(this.editor, interval);
    }
  },

  onDestroy() {
    const interval = autoVersioningIntervals.get(this.editor);
    if (interval) {
      clearInterval(interval);
      autoVersioningIntervals.delete(this.editor);
    }
  },

  addCommands() {
    const extension = this;

    return {
      saveVersion:
        (title?: string, changeDescription?: string) =>
        async ({ editor }: { editor: Editor }): Promise<boolean> => {
          const { ydoc, documentId, onCreateVersion } = extension.options;

          if (!ydoc || !onCreateVersion) {
            console.warn("VersionHistory: ydoc or onCreateVersion not configured");
            return false;
          }

          try {
            const documentTitle = title || "Untitled";
            const yjsState = Y.encodeStateAsUpdate(ydoc);
            const base64State = Buffer.from(yjsState).toString("base64");

            await onCreateVersion({
              documentId,
              title: documentTitle,
              yjsState: base64State,
              changeDescription,
            });

            extension.storage.latestVersion += 1;
            extension.storage.currentVersion = extension.storage.latestVersion;
            extension.storage.lastSavedAt = new Date();

            return true;
          } catch (error) {
            console.error("Failed to save version:", error);
            return false;
          }
        },

      toggleAutoVersioning:
        () =>
        ({ editor }: { editor: Editor }): boolean => {
          extension.storage.autoVersioningEnabled = !extension.storage.autoVersioningEnabled;

          const intervalMs = (extension.options.autoVersioningInterval || 300) * 1000;
          
          if (extension.storage.autoVersioningEnabled) {
            const existingInterval = autoVersioningIntervals.get(editor);
            if (existingInterval) {
              clearInterval(existingInterval);
            }

            const interval = setInterval(() => {
              if (editor.isDestroyed) {
                const int = autoVersioningIntervals.get(editor);
                if (int) clearInterval(int);
                autoVersioningIntervals.delete(editor);
                return;
              }

              const { ydoc } = extension.options;
              if (ydoc) {
                editor.commands.saveVersion(undefined, "Auto-saved version");
              }
            }, intervalMs);

            autoVersioningIntervals.set(editor, interval);
          } else {
            const interval = autoVersioningIntervals.get(editor);
            if (interval) {
              clearInterval(interval);
              autoVersioningIntervals.delete(editor);
            }
          }

          return true;
        },

      restoreVersion:
        (versionId: string, changeDescription?: string) =>
        async ({ editor }: { editor: Editor }): Promise<boolean> => {
          const { onRestoreVersion } = extension.options;

          if (!onRestoreVersion) {
            console.warn("VersionHistory: onRestoreVersion not configured");
            return false;
          }

          try {
            await onRestoreVersion(versionId, changeDescription);
            return true;
          } catch (error) {
            console.error("Failed to restore version:", error);
            return false;
          }
        },

      previewVersion:
        (yjsState: string) =>
        ({ editor }: { editor: Editor }): boolean => {
          const { ydoc } = extension.options;

          if (!ydoc) {
            console.warn("VersionHistory: ydoc not configured");
            return false;
          }

          try {
            const buffer = Buffer.from(yjsState, "base64");
            const update = new Uint8Array(buffer);
            const previewDoc = new Y.Doc();
            Y.applyUpdate(previewDoc, update);
            editor.setEditable(false);

            return true;
          } catch (error) {
            console.error("Failed to preview version:", error);
            return false;
          }
        },

      exitPreview:
        () =>
        ({ editor }: { editor: Editor }): boolean => {
          editor.setEditable(true);
          return true;
        },
    } as unknown as Partial<RawCommands>;
  },
});

export default VersionHistory;
