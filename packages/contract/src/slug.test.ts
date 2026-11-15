import { expect, test } from "bun:test";

import { slugify, WORKSPACE_SLUG } from "./slug.ts";

test("slugs are lowercase words joined by hyphens", () => {
  expect(slugify("Roadmap 2027")).toBe("roadmap-2027");
  expect(slugify("  Café — déjà vu!  ")).toBe("cafe-deja-vu");
  expect(slugify("Don't panic")).toBe("dont-panic");
  expect(slugify("日本語のノート")).toBe("日本語のノート");
  expect(slugify("!!!")).toBe("untitled");
  expect(slugify("", "workspace")).toBe("workspace");
  expect(slugify("a".repeat(200)).length).toBe(80);
  for (const name of ["Acme Inc.", "Roadmap 2027", "日本語"]) {
    expect(WORKSPACE_SLUG.test(slugify(name))).toBe(true);
  }
  expect(WORKSPACE_SLUG.test("Acme")).toBe(true);
  expect(WORKSPACE_SLUG.test("a--b")).toBe(false);
  expect(WORKSPACE_SLUG.test("-a")).toBe(false);
});
