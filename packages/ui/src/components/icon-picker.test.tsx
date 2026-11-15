import { afterEach, describe, expect, it, mock } from "bun:test";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { IconPicker } from "../index";

afterEach(() => cleanup());

// The emoji arrive from their own chunk.
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

describe("IconPicker", () => {
  it("opens on doodles, picked in the chosen colour", async () => {
    const onPick = mock();
    render(<IconPicker onPick={onPick} />);
    await settle();
    expect(screen.getByRole("tab", { name: "Doodles" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Star" }));
    expect(onPick).toHaveBeenLastCalledWith("doodle:star");
    fireEvent.click(screen.getByRole("button", { name: "Colour blue" }));
    fireEvent.click(screen.getByRole("button", { name: "Star" }));
    expect(onPick).toHaveBeenLastCalledWith("doodle:star:blue");
  });

  it("opens on emoji when the icon is one, and recolours the doodle that is the icon", async () => {
    const onRecolor = mock();
    const { unmount } = render(<IconPicker value="🚀" onPick={mock()} />);
    await settle();
    expect(screen.getByRole("tab", { name: "Emoji" }).getAttribute("aria-selected")).toBe("true");
    unmount();
    render(<IconPicker value="doodle:star:blue" onPick={mock()} onRecolor={onRecolor} />);
    await settle();
    expect(screen.getByRole("button", { name: "Colour blue" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Colour red" }));
    expect(onRecolor).toHaveBeenCalledWith("doodle:star:red");
  });

  it("searches doodles and emoji; Enter takes the first match, never the text typed", async () => {
    const onPick = mock();
    render(<IconPicker value="🚀" onPick={onPick} />);
    await settle();
    const search = screen.getByRole("searchbox", { name: "Search icons" });
    fireEvent.change(search, { target: { value: "zzzz" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText("No doodle or emoji matches.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "rocket" } });
    // Both kinds, the open tab's first.
    expect(screen.getByRole("button", { name: "rocket" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rocket" })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith("🚀");
  });
});
