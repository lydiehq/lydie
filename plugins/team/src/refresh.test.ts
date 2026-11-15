import { describe, expect, test } from "bun:test";

import { membersSignature, onReturn } from "./refresh.ts";

const row = (userId: string, role = "member", userName: string | null = userId) => ({
  userId,
  role,
  userName,
  userEmail: `${userId}@example.com`,
  userImage: null,
});

describe("membersSignature", () => {
  test("ignores order", () => {
    expect(membersSignature([row("a"), row("b")])).toBe(membersSignature([row("b"), row("a")]));
  });

  test("changes when someone joins, leaves, changes role or name", () => {
    const before = membersSignature([row("olivia", "owner")]);
    expect(membersSignature([row("olivia", "owner"), row("sam")])).not.toBe(before);
    expect(membersSignature([])).not.toBe(before);
    expect(membersSignature([row("olivia", "admin")])).not.toBe(before);
    expect(membersSignature([row("olivia", "owner", "Liv")])).not.toBe(before);
  });
});

describe("onReturn", () => {
  function setup(gapMs = 1000) {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    let time = 0;
    let calls = 0;
    const stop = onReturn(() => calls++, { window: win, document: doc, gapMs, now: () => time });
    return {
      win,
      doc,
      calls: () => calls,
      at: (t: number) => void (time = t),
      stop,
    };
  }

  test("runs on focus and when the tab is shown again", () => {
    const s = setup();
    s.at(5000);
    s.win.dispatchEvent(new Event("focus"));
    expect(s.calls()).toBe(1);
    s.at(10_000);
    s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.calls()).toBe(2);
  });

  test("not while hidden, and once for focus and visibility together", () => {
    const s = setup();
    s.doc.visibilityState = "hidden";
    s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.calls()).toBe(0);
    s.doc.visibilityState = "visible";
    s.at(5000);
    s.doc.dispatchEvent(new Event("visibilitychange"));
    s.win.dispatchEvent(new Event("focus"));
    expect(s.calls()).toBe(1);
  });

  test("stops listening", () => {
    const s = setup();
    s.stop();
    s.at(5000);
    s.win.dispatchEvent(new Event("focus"));
    expect(s.calls()).toBe(0);
  });
});
