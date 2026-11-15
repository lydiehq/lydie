import { expect, test } from "bun:test";

import { divergenceView } from "./divergence.ts";

test("shows the lines each side changed", () => {
  const view = divergenceView({
    reason: "both_changed",
    base: "Title\n\nOne.\n\nTwo.\n",
    ours: "Title\n\nOne, edited here.\n\nTwo.\n",
    theirs: "Title\n\nOne.\n\nTwo, edited there.\n",
    marked: null,
  });
  expect(view.reason).toBe("The published copy was changed there, and this document changed here.");
  expect(view.theirs).toEqual(["One.", "Two, edited there."]);
  expect(view.ours).toEqual(["One, edited here.", "Two."]);
  expect(view.pullRequest).toBeNull();
});

test("a deleted copy, conflict markers and a pull request", () => {
  expect(divergenceView({ reason: "remote_deleted", ours: "x", theirs: null })).toMatchObject({
    reason: "The published copy was deleted there.",
    theirs: [],
    ours: [],
  });
  const view = divergenceView({
    reason: "both_changed",
    ours: "a",
    theirs: "b",
    marked: "<<<<<<< lydie\na\n=======\nb\n>>>>>>> remote",
    pullRequest: "https://github.test/o/r/pull/3",
  });
  expect(view.marked).toContain("<<<<<<< lydie");
  expect(view.pullRequest).toBe("https://github.test/o/r/pull/3");
  expect(divergenceView(null).reason).toBe("The published copy and this document both changed.");
});
