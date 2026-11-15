import { appName } from "@lydie/plugin-api";
import type { Actor } from "@lydie/plugin-api";

export { appName };

// Who did something, in words. People come from the workspace's members (hosted) or are the one
// local person ("You"); agents are named by their app; the system by what it is.

// The user id a folder or browser workspace runs as.
export const LOCAL_USER_ID = "local";
export const FILE_BRIDGE_ID = "file-bridge";

export type Person = { name: string | null; email: string | null; image: string | null };

export type ActorInfo = {
  kind: Actor["type"];
  // Stable key for the filter: one per person, per agent app, per system actor.
  key: string;
  name: string;
  // The person an agent worked for, when it is worth saying (several people in the workspace).
  onBehalfOf: string | null;
  // The same person for their avatar, as a badge on the agent's.
  behalf?: { userId: string; image: string | null } | null;
  // A person's avatar.
  userId: string | null;
  image: string | null;
};

export function systemName(id: string): string {
  return id === FILE_BRIDGE_ID ? "File sync" : "Lydie";
}

// `members`: the workspace's people by user id (empty in local mode). `local`: this window is a
// folder or browser workspace, where the one person is "You".
export function describeActor(
  actor: Actor,
  members: ReadonlyMap<string, Person>,
  local: boolean,
): ActorInfo {
  const personName = (id: string) => {
    if (id === LOCAL_USER_ID || (local && members.size === 0)) return "You";
    const member = members.get(id);
    return member?.name || member?.email || "A former member";
  };
  switch (actor.type) {
    case "user": {
      const member = members.get(actor.id);
      return {
        kind: "user",
        key: `user:${actor.id}`,
        name: personName(actor.id),
        onBehalfOf: null,
        userId: actor.id,
        image: member?.image ?? null,
      };
    }
    case "agent":
      return {
        kind: "agent",
        key: `agent:${actor.app.toLowerCase()}`,
        name: appName(actor.app),
        // Only where more than one person could have asked.
        onBehalfOf: members.size > 1 ? personName(actor.onBehalfOf) : null,
        behalf:
          members.size > 1
            ? { userId: actor.onBehalfOf, image: members.get(actor.onBehalfOf)?.image ?? null }
            : null,
        userId: null,
        image: null,
      };
    case "system":
      return {
        kind: "system",
        key: `system:${actor.id}`,
        name: systemName(actor.id),
        onBehalfOf: null,
        userId: null,
        image: null,
      };
  }
}
