import { defineMutators } from "@rocicorp/zero";
import { mutators as sharedMutators } from "./mutators";
import { publishDocumentMutation } from "./server-mutators/documents/publish";
import { updateDocumentMutation } from "./server-mutators/documents/update";
import { deleteDocumentMutation } from "./server-mutators/documents/delete";
import { disconnectIntegrationMutation } from "./server-mutators/integrations/disconnect";
import { createIntegrationLinkMutation } from "./server-mutators/integrations/create-link";

export function createServerMutators(asyncTasks: Array<() => Promise<void>>) {
  return defineMutators(sharedMutators, {
    document: {
      publish: publishDocumentMutation(asyncTasks),
      update: updateDocumentMutation(asyncTasks),
      delete: deleteDocumentMutation(asyncTasks),
    },
    integrationConnection: {
      disconnect: disconnectIntegrationMutation(asyncTasks),
    },
    integration: {
      createLink: createIntegrationLinkMutation(asyncTasks),
    },
  });
}
