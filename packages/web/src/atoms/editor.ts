import type { Editor } from "@tiptap/react";

import { atom } from "jotai";

// Global atom to store the current document editor instance.
export const documentEditorAtom = atom<Editor | null>(null);

// Global atom to store the current title editor instance.
export const titleEditorAtom = atom<Editor | null>(null);

// Pending editor change to be applied after navigation
export type PendingEditorChange = {
  documentId: string;
  title?: string;
  search: string;
  replace: string;
  organizationId: string;
};

export const pendingEditorChangeAtom = atom<PendingEditorChange | null>(null);

// Status of pending editor change application
export type PendingChangeStatus = "pending" | "applying" | "applied" | "failed" | null;

export const pendingChangeStatusAtom = atom<PendingChangeStatus>(null);
