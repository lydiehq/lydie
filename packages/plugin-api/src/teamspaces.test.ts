import { describe, expect, test } from "bun:test";

import { spaceName, TEAMSPACES_UI, teamspacesShown, WORKSPACE_SECTION } from "./teamspaces.ts";

const general = { name: "General", isDefault: true };
const design = { name: "Design", isDefault: false };

describe.skipIf(TEAMSPACES_UI)("teamspaces, hidden", () => {
  test("a workspace with only its default teamspace (or none) hides them", () => {
    expect(teamspacesShown([])).toBe(false);
    expect(teamspacesShown([general])).toBe(false);
    expect(spaceName(general, false)).toBe(WORKSPACE_SECTION);
  });

  test("another teamspace, or a second default one, shows them all by name", () => {
    expect(teamspacesShown([general, design])).toBe(true);
    expect(teamspacesShown([design])).toBe(true);
    expect(teamspacesShown([general, { name: "Studio", isDefault: true }])).toBe(true);
    expect(spaceName(general, true)).toBe("General");
    expect(spaceName(design, true)).toBe("Design");
  });
});
