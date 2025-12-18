import { defineMutators } from "@rocicorp/zero";
import { mutators as sharedMutators } from "./mutators";
import { publishDocumentMutation } from "./server-mutators/documents/publish";
import { updateDocumentMutation } from "./server-mutators/documents/update";
import { disconnectIntegrationMutation } from "./server-mutators/integrations/disconnect";

export function createServerMutators(asyncTasks: Array<() => Promise<void>>) {
  return defineMutators(sharedMutators, {
    document: {
      publish: publishDocumentMutation(asyncTasks),
      // Override the shared mutator definition with same name.
      update: updateDocumentMutation(asyncTasks),
    },
    integration: {
      disconnect: disconnectIntegrationMutation(asyncTasks),
    },
  });
}
