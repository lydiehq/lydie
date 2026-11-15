import type { Activity } from "@lydie/plugin-api";

// Activity rows for tests.
let next = 0;
export function activity(over: Partial<Activity> = {}): Activity {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    workspaceId: "w1",
    actor: { type: "user", id: "local" },
    sessionId: null,
    type: "doc.created",
    targetId: "11111111-1111-4111-8111-111111111111",
    targetTitle: "Roadmap",
    data: {},
    count: 1,
    firstAt: "2026-11-15T10:00:00.000Z",
    lastAt: "2026-11-15T10:00:00.000Z",
    ...over,
  };
}
