import { describe, expect, it } from "bun:test";

import { ACTIVITY_TYPES, isWorkspaceActivityType } from "@lydie/plugin-api";

import { appName, describeActor } from "./actors.ts";
import type { Person } from "./actors.ts";
import { describeActivity, formatRange, propertyList, sentenceText } from "./describe.ts";
import { activity } from "./fixtures.ts";

const text = (over: Parameters<typeof activity>[0]) =>
  sentenceText(describeActivity(activity(over)));

describe("describeActivity", () => {
  it("reads each event type as a sentence", () => {
    expect(text({ type: "doc.created" })).toBe("created Roadmap");
    expect(
      text({
        type: "doc.renamed",
        targetTitle: "New",
        data: { previousTitle: "Old", title: "New" },
      }),
    ).toBe("renamed Old to New");
    expect(text({ type: "doc.renamed", data: {} })).toBe("renamed Roadmap");
    expect(text({ type: "doc.moved", data: { parentId: "p2", previousParentId: "p1" } })).toBe(
      "moved Roadmap",
    );
    expect(text({ type: "doc.moved", data: { parentId: null, previousParentId: "p1" } })).toBe(
      "moved Roadmap to the top level",
    );
    expect(text({ type: "doc.bodyUpdated" })).toBe("edited Roadmap");
    expect(text({ type: "doc.deleted", data: { count: 4 } })).toBe(
      "deleted Roadmap and 3 pages inside it",
    );
    expect(text({ type: "doc.deleted", data: { count: 2 } })).toBe(
      "deleted Roadmap and 1 page inside it",
    );
    expect(text({ type: "doc.deleted", data: { count: 1 } })).toBe("deleted Roadmap");
    expect(text({ type: "doc.restored", data: { count: 1 } })).toBe("restored Roadmap");
    expect(text({ type: "doc.purged", data: { count: 3 } })).toBe(
      "permanently deleted Roadmap and 2 pages inside it",
    );
    expect(text({ type: "attachment.created", targetTitle: "x.png" })).toBe("added file x.png");
    expect(text({ type: "attachment.deleted", targetTitle: "x.png" })).toBe("deleted file x.png");
    expect(text({ type: "attachment.restored", targetTitle: "x.png" })).toBe("restored file x.png");
    expect(text({ type: "attachment.purged", targetTitle: "x.png" })).toBe(
      "permanently deleted file x.png",
    );
    expect(
      text({ type: "database.changed", targetTitle: "Tasks", data: { change: "views" } }),
    ).toBe("changed the views of Tasks");
    expect(
      text({ type: "database.changed", targetTitle: "Tasks", data: { change: "properties" } }),
    ).toBe("changed the properties of Tasks");
  });

  it("names changed properties, a few at most", () => {
    expect(
      text({
        type: "doc.propertiesChanged",
        targetTitle: "Bug 12",
        data: { keys: ["Status", "Priority"] },
      }),
    ).toBe("changed Status, Priority on Bug 12");
    expect(text({ type: "doc.propertiesChanged", data: { keys: ["icon"] } })).toBe(
      "changed the icon of Roadmap",
    );
    expect(text({ type: "doc.propertiesChanged", data: {} })).toBe(
      "changed the properties of Roadmap",
    );
    expect(propertyList(["a", "b", "c", "d"])).toBe("a, b, c, d");
    expect(propertyList(["a", "b", "c", "d", "e", "f"])).toBe("a, b, c and 3 more");
    expect(propertyList(["cover", "cover-position"])).toBe("the cover");
  });

  it("reads changes to the workspace itself", () => {
    const user = (name: string | null) => ({ kind: "user" as const, id: "u2", name });
    const ws = { workspaceId: "w1", targetId: null, targetTitle: null };
    const sentences: Array<[Parameters<typeof activity>[0], string]> = [
      [
        {
          ...ws,
          type: "workspace.created",
          data: { subject: { kind: "workspace", id: "w1", name: "Acme" } },
        },
        "created the workspace Acme",
      ],
      [
        {
          ...ws,
          type: "workspace.renamed",
          data: { subject: { kind: "workspace", id: "w1", name: "Acme" }, previousName: "Ac" },
        },
        "renamed the workspace Ac to Acme",
      ],
      [
        {
          ...ws,
          type: "workspace.renamed",
          data: { subject: { kind: "workspace", id: "w1", name: "Acme" }, slug: "acme" },
        },
        "changed the workspace's address to /w/acme",
      ],
      [
        { ...ws, type: "workspace.ownershipTransferred", data: { subject: user("Maya") } },
        "made Maya the owner of the workspace",
      ],
      [
        {
          ...ws,
          type: "member.invited",
          data: {
            subject: { kind: "invitation", id: "i1", name: "maya@example.com" },
            role: "admin",
          },
        },
        "invited maya@example.com as an admin",
      ],
      [
        {
          type: "member.invited",
          data: {
            subject: { kind: "invitation", id: "i1", name: "maya@example.com" },
            role: "guest",
            level: "edit",
          },
        },
        "invited maya@example.com to Roadmap (can edit)",
      ],
      [
        {
          ...ws,
          type: "invitation.revoked",
          data: { subject: { kind: "invitation", id: "i1", name: "maya@example.com" } },
        },
        "cancelled the invitation of maya@example.com",
      ],
      [
        { ...ws, type: "invitation.declined", data: {} },
        "declined the invitation to the workspace",
      ],
      [
        {
          ...ws,
          type: "member.joined",
          actor: { type: "user", id: "u2" },
          data: { subject: user("Maya"), role: "member" },
        },
        "joined the workspace",
      ],
      [
        {
          ...ws,
          type: "member.joined",
          actor: { type: "user", id: "u2" },
          data: { subject: user("Maya"), role: "guest" },
        },
        "joined the workspace as a guest",
      ],
      [
        {
          ...ws,
          type: "member.roleChanged",
          data: { subject: user("Maya"), role: "admin", previousRole: "member" },
        },
        "changed Maya's role from member to admin",
      ],
      [
        { ...ws, type: "member.roleChanged", data: { subject: user("Maya"), role: "guest" } },
        "changed Maya's role to guest",
      ],
      [
        { ...ws, type: "member.removed", data: { subject: user("Maya") } },
        "removed Maya from the workspace",
      ],
      [
        { ...ws, type: "member.removed", data: { subject: user(null) } },
        "removed someone from the workspace",
      ],
      [{ ...ws, type: "member.left", data: { subject: user("Maya") } }, "left the workspace"],
    ];
    for (const [over, sentence] of sentences) expect(text(over)).toBe(sentence);
  });

  it("reads teamspace, sharing, token and publishing changes", () => {
    const ws = { workspaceId: "w1", targetId: null, targetTitle: null };
    const design = { kind: "teamspace" as const, id: "t1", name: "Design" };
    const maya = { kind: "user" as const, id: "u2", name: "Maya" };
    const blog = { kind: "publication" as const, id: "p1", name: "Blog" };
    const sentences: Array<[Parameters<typeof activity>[0], string]> = [
      [
        { ...ws, type: "teamspace.created", data: { subject: design } },
        "created the teamspace Design",
      ],
      [
        { ...ws, type: "teamspace.renamed", data: { subject: design, previousName: "Art" } },
        "renamed the teamspace Art to Design",
      ],
      [
        {
          ...ws,
          type: "teamspace.visibilityChanged",
          data: { subject: design, visibility: "private", previousVisibility: "open" },
        },
        "made the teamspace Design private",
      ],
      [
        { ...ws, type: "teamspace.deleted", data: { subject: design } },
        "deleted the teamspace Design",
      ],
      [
        {
          ...ws,
          type: "teamspace.memberAdded",
          data: { subject: maya, teamspace: { id: "t1", name: "Design" }, role: "member" },
        },
        "added Maya to Design",
      ],
      [
        {
          ...ws,
          type: "teamspace.memberAdded",
          actor: { type: "user", id: "u2" },
          data: { subject: maya, teamspace: { id: "t1", name: "Design" }, role: "member" },
        },
        "joined the teamspace Design",
      ],
      [
        {
          ...ws,
          type: "teamspace.memberRemoved",
          data: { subject: maya, teamspace: { id: "t1", name: "Design" } },
        },
        "removed Maya from Design",
      ],
      [
        {
          ...ws,
          type: "teamspace.memberRoleChanged",
          data: { subject: maya, teamspace: { id: "t1", name: "Design" }, role: "owner" },
        },
        "made Maya an owner of Design",
      ],
      [
        { type: "share.granted", data: { subject: maya, level: "edit" } },
        "shared Roadmap with Maya (can edit)",
      ],
      [
        { type: "share.granted", data: { subject: maya, level: "view", role: "guest" } },
        "shared Roadmap with Maya as a guest (can view)",
      ],
      [
        { type: "share.granted", data: { subject: design, level: "comment" } },
        "shared Roadmap with the teamspace Design (can comment)",
      ],
      [
        {
          type: "share.granted",
          data: { subject: { kind: "workspace", id: "w1", name: "Acme" }, level: "view" },
        },
        "shared Roadmap with everyone in Acme (can view)",
      ],
      [
        { type: "share.changed", data: { subject: maya, level: "edit", previousLevel: "view" } },
        "changed the access of Maya to Roadmap from view to edit",
      ],
      [{ type: "share.revoked", data: { subject: maya } }, "stopped sharing Roadmap with Maya"],
      [
        { type: "share.restrictionChanged", data: { restricted: true } },
        "restricted access to Roadmap",
      ],
      [
        { type: "share.restrictionChanged", data: { restricted: false } },
        "opened access to Roadmap",
      ],
      [{ type: "shareLink.created", data: {} }, "created a share link for Roadmap"],
      [{ type: "shareLink.revoked", data: {} }, "revoked a share link for Roadmap"],
      [
        {
          ...ws,
          type: "apiToken.created",
          data: { subject: { kind: "token", id: "k1", name: "CI" } },
        },
        "created the API token CI",
      ],
      [
        {
          ...ws,
          type: "apiToken.revoked",
          data: { subject: { kind: "token", id: "k1", name: "CI" } },
        },
        "revoked the API token CI",
      ],
      [
        {
          ...ws,
          type: "oauthGrant.created",
          data: { subject: { kind: "app", id: "g1", name: "Claude" } },
        },
        "connected the app Claude",
      ],
      [
        {
          ...ws,
          type: "connection.added",
          data: {
            subject: { kind: "connection", id: "c1", name: "WordPress" },
            service: "WordPress",
          },
        },
        "connected WordPress",
      ],
      [
        {
          ...ws,
          type: "connection.removed",
          data: { subject: { kind: "connection", id: "c1", name: "Blog" }, service: "WordPress" },
        },
        "disconnected WordPress (Blog)",
      ],
      [
        { type: "publication.created", data: { subject: blog, service: "WordPress" } },
        "set up publishing Roadmap to Blog",
      ],
      [
        { type: "publication.published", data: { subject: blog, service: "WordPress", count: 1 } },
        "published Roadmap to Blog",
      ],
      [
        {
          type: "publication.published",
          data: { subject: blog, service: "WordPress", count: 3, failed: 1 },
        },
        "published Roadmap and 2 pages under it to Blog (1 page failed)",
      ],
      [
        { type: "publication.failed", data: { subject: blog, service: "WordPress" } },
        "could not publish Roadmap to Blog",
      ],
      [
        { type: "publication.unpublished", data: { subject: blog, service: "WordPress" } },
        "unpublished Roadmap from Blog",
      ],
      [
        { ...ws, type: "backup.frequencyChanged", data: { frequency: "weekly" } },
        "turned on weekly backups",
      ],
      [
        { ...ws, type: "backup.frequencyChanged", data: { frequency: "off" } },
        "turned off automatic backups",
      ],
      [
        { type: "doc.moved", data: { parentId: null, teamspace: { id: "t1", name: "Design" } } },
        "moved Roadmap to Design",
      ],
      [
        { type: "doc.moved", data: { parentId: null, teamspace: null } },
        "moved Roadmap to Private",
      ],
    ];
    for (const [over, sentence] of sentences) expect(text(over)).toBe(sentence);
  });

  it("describes every change to the workspace in its own words", () => {
    for (const type of ACTIVITY_TYPES.filter(isWorkspaceActivityType)) {
      const sentence = text({ type, targetId: null, targetTitle: null, data: {} });
      expect(sentence).not.toBe("changed Untitled");
    }
  });

  it("names, never links, a workspace change's subject", () => {
    const parts = describeActivity(
      activity({
        type: "apiToken.created",
        targetId: null,
        data: { subject: { kind: "token", id: "k1", name: "CI" } },
      }),
    ).parts;
    expect(parts.some((p) => typeof p === "object" && p.kind === "target")).toBe(false);
  });

  it("reads an event type it does not know as a change", () => {
    expect(text({ type: "made.up" as never })).toBe("changed Roadmap");
  });

  it("calls a page without a title Untitled", () => {
    expect(text({ targetTitle: null })).toBe("created Untitled");
    expect(text({ targetTitle: "  " })).toBe("created Untitled");
  });

  it("links pages and databases but not files or purged pages", () => {
    const linkOf = (over: Parameters<typeof activity>[0]) =>
      describeActivity(activity(over)).parts.find(
        (p) => typeof p === "object" && p.kind === "target",
      );
    expect(linkOf({ type: "doc.bodyUpdated" })).toMatchObject({ link: true });
    expect(linkOf({ type: "doc.purged" })).toMatchObject({ link: false });
    expect(linkOf({ type: "attachment.created" })).toMatchObject({ link: false });
    expect(linkOf({ type: "database.changed" })).toMatchObject({ link: true });
    // A page shows its title now, except in the rename that is about its titles.
    expect(linkOf({ type: "doc.created" })).toMatchObject({ current: true });
    expect(linkOf({ type: "doc.renamed", data: { previousTitle: "A" } })).toMatchObject({
      current: false,
    });
  });

  it("gives a time range only to rows that span a while", () => {
    expect(describeActivity(activity({ type: "doc.bodyUpdated", count: 1 })).range).toBeNull();
    expect(
      describeActivity(
        activity({
          type: "doc.bodyUpdated",
          count: 14,
          firstAt: "2026-11-15T10:00:00.000Z",
          lastAt: "2026-11-15T10:00:30.000Z",
        }),
      ).range,
    ).toBeNull();
    expect(
      describeActivity(
        activity({
          type: "doc.bodyUpdated",
          count: 14,
          firstAt: "2026-11-15T10:02:00.000Z",
          lastAt: "2026-11-15T10:40:00.000Z",
        }),
      ).range,
    ).toEqual({ from: "2026-11-15T10:02:00.000Z", to: "2026-11-15T10:40:00.000Z" });
    expect(formatRange("2026-11-15T10:02:00.000Z", "2026-11-15T10:40:00.000Z")).toMatch(
      /\d.*–.*\d/,
    );
  });
});

describe("describeActor", () => {
  const members = new Map<string, Person>([
    ["u1", { name: "Maya", email: "maya@example.com", image: null }],
    ["u2", { name: null, email: "sam@example.com", image: "https://x/y.png" }],
  ]);

  it("names people, agents and the system", () => {
    expect(describeActor({ type: "user", id: "local" }, new Map(), true).name).toBe("You");
    expect(describeActor({ type: "user", id: "u1" }, members, false).name).toBe("Maya");
    expect(describeActor({ type: "user", id: "u2" }, members, false)).toMatchObject({
      name: "sam@example.com",
      image: "https://x/y.png",
    });
    expect(describeActor({ type: "user", id: "gone" }, members, false).name).toBe(
      "A former member",
    );
    const agent = describeActor(
      { type: "agent", app: "claude-code", id: "s1", onBehalfOf: "u1" },
      members,
      false,
    );
    expect(agent).toMatchObject({
      name: "Claude Code",
      onBehalfOf: "Maya",
      behalf: { userId: "u1" },
      key: "agent:claude-code",
    });
    // Alone in the workspace: who asked goes without saying.
    expect(
      describeActor(
        { type: "agent", app: "cursor", id: "s1", onBehalfOf: "local" },
        new Map(),
        true,
      ).onBehalfOf,
    ).toBeNull();
    expect(describeActor({ type: "system", id: "file-bridge" }, members, true).name).toBe(
      "File sync",
    );
  });

  it("turns client names into app names", () => {
    expect(appName("claude-code")).toBe("Claude Code");
    expect(appName("my_tool")).toBe("My Tool");
    expect(appName("api-token")).toBe("API token");
    expect(appName("")).toBe("An agent");
  });
});
