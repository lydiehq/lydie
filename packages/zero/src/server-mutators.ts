import { defineMutators } from "@rocicorp/zero";

import { mutators as sharedMutators } from "./mutators/index";
import { deleteDocumentMutation } from "./server-mutators/documents/delete";
import { moveDocumentMutation } from "./server-mutators/documents/move";
import { publishDocumentMutation } from "./server-mutators/documents/publish";
import { updateDocumentMutation } from "./server-mutators/documents/update";
import { createFeedbackMutation } from "./server-mutators/feedback/create";
import { createIntegrationLinkMutation } from "./server-mutators/integrations/create-link";
import { disconnectIntegrationMutation } from "./server-mutators/integrations/disconnect";
import { createOrganizationMutation } from "./server-mutators/organization/create";
import { createTemplateMutation } from "./server-mutators/templates/create";

export interface MutatorContext {
  asyncTasks: Array<() => Promise<void>>;
}

export function createServerMutators(asyncTasks: Array<() => Promise<void>>) {
  const context = { asyncTasks };

  return defineMutators(sharedMutators, {
    organization: {
      create: createOrganizationMutation(context),
    },
    document: {
      publish: publishDocumentMutation(context),
      update: updateDocumentMutation(context),
      move: moveDocumentMutation(context),
      delete: deleteDocumentMutation(context),
    },
    integrationConnection: {
      disconnect: disconnectIntegrationMutation(context),
    },
    integration: {
      createLink: createIntegrationLinkMutation(context),
    },
    feedback: {
      create: createFeedbackMutation(context),
    },
    template: {
      create: createTemplateMutation(context),
    },
  });
}
