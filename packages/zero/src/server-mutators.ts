import { defineMutators } from "@rocicorp/zero";
import { mutators as sharedMutators } from "./mutators";
import { publishDocumentMutation } from "./server-mutators/documents/publish";
import { updateDocumentMutation } from "./server-mutators/documents/update";

export function createServerMutators(asyncTasks: Array<() => Promise<void>>) {
  return defineMutators(sharedMutators, {
    document: {
      publish: publishDocumentMutation(asyncTasks),
      // Override the shared mutator definition with same name.
      update: updateDocumentMutation(asyncTasks),
    },
  });
}
