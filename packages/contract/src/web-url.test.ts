import { describe, expect, it } from "bun:test";

import { docUrlSegment, webDocUrl } from "./web-url.ts";

const ID = "01a1e58a-2fc4-73f6-b6b7-9453b4540bb8";

describe("webDocUrl", () => {
  it("links to the document in the web app, with its title for people", () => {
    expect(webDocUrl("https://app.lydie.co", "lydie", { id: ID, title: "Launch plan" })).toBe(
      "https://app.lydie.co/w/lydie/d/launch-plan-01a1e58a2fc473f6b6b79453b4540bb8",
    );
    expect(webDocUrl("http://localhost:3000/app/", "acme", { id: ID, title: "Ça va?" })).toBe(
      "http://localhost:3000/app/w/acme/d/ca-va-01a1e58a2fc473f6b6b79453b4540bb8",
    );
  });

  it("is the bare id without a title", () => {
    expect(docUrlSegment(ID, "  ")).toBe(`d/${ID}`);
    expect(webDocUrl("https://app.lydie.co", ID, { id: ID })).toBe(
      `https://app.lydie.co/w/${ID}/d/${ID}`,
    );
  });
});
