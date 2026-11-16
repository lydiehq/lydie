import { describe, expect, test } from "bun:test";

import { docPath, webDocUrl } from "@lydie/contract";

import { appUrl, belowBase, parseAppUrl } from "./url.ts";

const id = "0193a5e2-7c3b-7def-8a1b-2c3d4e5f6a7b";
const hex = "0193a5e27c3b7def8a1b2c3d4e5f6a7b";

describe("pages as URLs", () => {
  test("a path is the URL below the base", () => {
    expect(appUrl("/", "/")).toBe("/");
    expect(appUrl("/app/", "/")).toBe("/app/");
    expect(appUrl("/", docPath(id))).toBe(`/d/${id}`);
    expect(appUrl("/app/", "/trash")).toBe("/app/trash");
  });

  test("the window's query string goes before the fragment", () => {
    expect(appUrl("/", docPath(id, { heading: "To do" }), null, "?embed=1")).toBe(
      `/d/${id}?embed=1#To%20do`,
    );
    expect(appUrl("/", docPath(id, { blockId: "b1" }))).toBe(`/d/${id}#^b1`);
  });

  test("the core's links to a document open it", () => {
    const url = new URL(webDocUrl("https://app.lydie.co", "acme", { id, title: "Q1 plan" }));
    expect(url.pathname).toBe(appUrl("/", docPath(id), "acme", "", "Q1 plan"));
    expect(parseAppUrl(url.pathname.slice(1))).toEqual({ workspace: "acme", path: docPath(id) });
  });

  test("a hosted workspace's pages are under w/<its slug or id>", () => {
    expect(appUrl("/", "/", "acme")).toBe("/w/acme");
    expect(appUrl("/", docPath(id), "acme")).toBe(`/w/acme/d/${id}`);
    expect(appUrl("/app/", "/trash", id, "?x=1")).toBe(`/app/w/${id}/trash?x=1`);
  });

  test("a document's URL carries its title; only the id counts", () => {
    expect(appUrl("/", docPath(id), "acme", "", "Roadmap 2027")).toBe(
      `/w/acme/d/roadmap-2027-${hex}`,
    );
    expect(appUrl("/", docPath(id, { heading: "Q1" }), null, "", "Café")).toBe(`/d/cafe-${hex}#Q1`);
    expect(appUrl("/", docPath(id), null, "", "  ")).toBe(`/d/${id}`);
    expect(appUrl("/", "/trash", null, "", "Trash")).toBe("/trash");
    for (const below of [
      `d/roadmap-2027-${hex}`,
      `d/an-older-title-${hex}`,
      `d/${hex}`,
      `d/${id}`,
    ]) {
      expect(parseAppUrl(below)).toEqual({ workspace: null, path: docPath(id) });
    }
    expect(parseAppUrl(`w/acme/d/x-${hex}`, "#Q1")).toEqual({
      workspace: "acme",
      path: docPath(id, { heading: "Q1" }),
    });
  });

  test("parses what it writes", () => {
    for (const workspace of [null, "acme"]) {
      for (const path of ["/", "/trash", docPath(id), docPath(id, { heading: "A & b" })]) {
        for (const title of [null, "Plan B"]) {
          const url = new URL(appUrl("/app/", path, workspace, "?embed=1", title), "http://x");
          expect(parseAppUrl(url.pathname.slice("/app/".length), url.hash)).toEqual({
            workspace,
            path,
          });
        }
      }
    }
  });

  test("what follows the base", () => {
    expect(belowBase("/", "/")).toBe("");
    expect(belowBase("/", "/index.html")).toBe("");
    expect(belowBase("/", "/d/1")).toBe("d/1");
    expect(belowBase("/app/", "/app")).toBe("");
    expect(belowBase("/app/", "/app/w/ws1/trash")).toBe("w/ws1/trash");
    expect(belowBase("/app/", "/other")).toBeNull();
  });

  test("tolerates trailing slashes and other spellings of a heading", () => {
    expect(parseAppUrl("trash/")).toEqual({ workspace: null, path: "/trash" });
    expect(parseAppUrl("w/ws1/")).toEqual({ workspace: "ws1", path: "/" });
    expect(parseAppUrl(`d/${id}`, "#A&b")).toEqual({
      workspace: null,
      path: docPath(id, { heading: "A&b" }),
    });
    expect(parseAppUrl(`d/${id}`, "#")).toEqual({ workspace: null, path: docPath(id) });
  });
});
