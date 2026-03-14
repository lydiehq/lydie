import { atom, getDefaultStore } from "jotai";

export type MentionDocumentItem = {
  id: string;
  title: string | null;
};

export const mentionDocumentsAtom = atom<MentionDocumentItem[]>([]);

const mentionDocumentsStore = getDefaultStore();

export function setMentionDocuments(items: MentionDocumentItem[]) {
  mentionDocumentsStore.set(mentionDocumentsAtom, items);
}

export function getMentionDocuments() {
  return mentionDocumentsStore.get(mentionDocumentsAtom);
}
