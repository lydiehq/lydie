import type { Editor } from "@tiptap/react";

import { applyContentChanges } from "@/utils/document-changes";
import { applyTitleChange } from "@/utils/title-changes";

type ApplyDocumentChangeInput = {
  titleEditor: Editor | null;
  contentEditor: Editor | null;
  documentId: string;
  organizationId: string;
  title?: string;
  replace?: string;
  selectionWithEllipsis?: string;
  z: any;
  onLLMStateChange?: (usingLLM: boolean) => void;
};

type ApplyDocumentChangeResult = {
  success: boolean;
  titleSuccess: boolean;
  contentSuccess: boolean;
  titleError: string;
  contentError: string;
  usedLLMFallback: boolean;
};

export async function applyDocumentChange({
  titleEditor,
  contentEditor,
  documentId,
  organizationId,
  title,
  replace,
  selectionWithEllipsis = "",
  z,
  onLLMStateChange,
}: ApplyDocumentChangeInput): Promise<ApplyDocumentChangeResult> {
  let titleSuccess = true;
  let contentSuccess = true;
  let titleError = "";
  let contentError = "";
  let usedLLMFallback = false;

  if (title && titleEditor) {
    const titleResult = await applyTitleChange(titleEditor, title, documentId, organizationId, z);
    titleSuccess = titleResult.success;
    if (!titleResult.success) {
      titleError = titleResult.error || "Unknown title error";
    }
  }

  if (replace && contentEditor) {
    const contentResult = await applyContentChanges(
      contentEditor,
      [
        {
          selectionWithEllipsis,
          replace,
        },
      ],
      organizationId,
      undefined,
      onLLMStateChange,
    );
    contentSuccess = contentResult.success;
    usedLLMFallback = Boolean(contentResult.usedLLMFallback);
    if (!contentResult.success) {
      contentError = contentResult.error || "Unknown content error";
    }
  }

  return {
    success: titleSuccess && contentSuccess,
    titleSuccess,
    contentSuccess,
    titleError,
    contentError,
    usedLLMFallback,
  };
}
