import { describe, expect, test } from "bun:test";

import type { WorkspaceScope } from "@lydie/plugin-api";

import { decideScope, linkedScope, LOCAL } from "./scope.ts";

const A = "0193a5e2-7c3b-7def-8a1b-00000000000a";
const B = "0193a5e2-7c3b-7def-8a1b-00000000000b";
const X = "0193a5e2-7c3b-7def-8a1b-0000000000ff";
const hosted = (workspaceId: string): WorkspaceScope => ({ kind: "hosted", workspaceId });

// The user's workspaces: A is "acme", B is "beta".
const mine: Record<string, string> = { [A]: A, acme: A, [B]: B, beta: B };

const decide = (
  linked: WorkspaceScope | null,
  preferred: WorkspaceScope | null,
  { signedIn = true } = {},
) =>
  decideScope({
    linked,
    preferred,
    signedIn: async () => signedIn,
    resolve: async (ref) => mine[ref] ?? null,
  });

describe("the workspace a window opens", () => {
  test("the URL names it, by slug or id", () => {
    expect(linkedScope("/", "/")).toBeNull();
    expect(linkedScope("/app/", "/app")).toBeNull();
    expect(linkedScope("/", "/w/acme")).toEqual(hosted("acme"));
    expect(linkedScope("/app/", `/app/w/${A}/d/1`)).toEqual(hosted(A));
    expect(linkedScope("/", "/d/1")).toEqual(LOCAL);
    expect(linkedScope("/", "/settings/general")).toEqual(LOCAL);
  });

  test("the URL's workspace, else the one opened last, else this browser's", async () => {
    expect(await decide(null, null)).toEqual({ scope: LOCAL, wanted: null, notice: null });
    expect((await decide(null, hosted(A))).scope).toEqual(hosted(A));
    expect((await decide(hosted("beta"), hosted(A))).scope).toEqual(hosted(B));
    expect((await decide(hosted(B), hosted(A))).scope).toEqual(hosted(B));
    expect((await decide(LOCAL, hosted(A))).scope).toEqual(LOCAL);
  });

  test("signed out: this browser's workspace, with the hosted one waiting as it was named", async () => {
    expect(await decide(hosted("acme"), null, { signedIn: false })).toEqual({
      scope: LOCAL,
      wanted: hosted("acme"),
      notice: null,
    });
    expect((await decide(null, hosted(A), { signedIn: false })).wanted).toEqual(hosted(A));
    // Signed in afterwards, the slug kept as the preference resolves.
    expect((await decide(null, hosted("acme"))).scope).toEqual(hosted(A));
  });

  test("a link to a workspace that is not the user's opens the last one, and says so", async () => {
    const other = await decide(hosted("elsewhere"), hosted(A));
    expect(other.scope).toEqual(hosted(A));
    expect(other.notice).toBeString();
    expect((await decide(hosted(X), null)).scope).toEqual(LOCAL);
    // The workspace opened last is not looked up: it opens offline.
    expect((await decide(null, hosted(X))).scope).toEqual(hosted(X));
  });
});
