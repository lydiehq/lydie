import {
  InferAgentUIMessage,
  LanguageModel,
  smoothStream,
  stepCountIs,
  ToolLoopAgent,
} from "ai";
import { searchInDocument } from "../../tools/search-in-document";
import { readCurrentDocument } from "../../tools/read-current-document";
import { replaceInDocument } from "../../tools/replace-in-document";
import { searchDocuments } from "../../tools/search-documents";
import { readDocument } from "../../tools/read-document";
import { listDocuments } from "../../tools/list-documents";
import { google } from "@ai-sdk/google";

export interface DocumentChatMessageMetadata {
  createdAt?: string;
  duration?: number;
  usage?: number;
}

interface BuildDocumentAgentParams {
  documentId: string;
  userId: string;
  currentDocument: {
    id: string;
    organizationId: string;
  };
  instructions: string;
  model: LanguageModel;
}

// This function is kept only for type inference - the actual agent creation is inlined in document-chat.ts
function buildDocumentAgent(params: BuildDocumentAgentParams) {
  const { documentId, userId, currentDocument, instructions, model } = params;

  return new ToolLoopAgent({
    model,
    instructions,
    // TODO: fix - this is just an arbitrary number to stop the agent from running forever
    stopWhen: stepCountIs(50),
    // @ts-expect-error - experimental_transform is not typed
    experimental_transform: smoothStream({ chunking: "word" }),
    tools: {
      // google_search: google.tools.googleSearch({}),
      search_in_document: searchInDocument(
        documentId,
        userId,
        currentDocument.organizationId
      ),
      read_current_document: readCurrentDocument(documentId),
      replace_in_document: replaceInDocument(),
      search_documents: searchDocuments(
        userId,
        currentDocument.organizationId,
        currentDocument.id
      ),
      read_document: readDocument(userId, currentDocument.organizationId),
      list_documents: listDocuments(
        userId,
        currentDocument.organizationId,
        currentDocument.id
      ),
    },
  });
}

type BaseDocumentChatAgentUIMessage = InferAgentUIMessage<
  typeof buildDocumentAgent
>;

export type DocumentChatAgentUIMessage = Omit<
  BaseDocumentChatAgentUIMessage,
  "metadata"
> & {
  metadata: DocumentChatMessageMetadata;
};
