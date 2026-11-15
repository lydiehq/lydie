import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { IconPicker } from "../index";

// happy-dom lays nothing out: without a size the virtualized list would render no cells.
const sized = ["clientWidth", "clientHeight"] as const;
const before = sized.map((key) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 304,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
});
afterAll(() => {
  sized.forEach((key, i) => {
    const descriptor = before[i];
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  });
});
afterEach(() => cleanup());

// Typed as a person would: React Aria's Autocomplete moves to the first match only for typing
// (`beforeinput` with `insertText`), not for a value set some other way.
function type(input: HTMLElement, text: string) {
  input.dispatchEvent(
    new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true }),
  );
  fireEvent.change(input, { target: { value: text } });
}

// The emoji arrive from their own chunk.
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

describe("IconPicker", () => {
  it("opens on doodles, picked in the chosen colour", async () => {
    const onPick = mock();
    render(<IconPicker onPick={onPick} />);
    await settle();
    expect(screen.getByRole("tab", { name: "Doodles" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "Star" }));
    expect(onPick).toHaveBeenLastCalledWith("doodle:star");
    fireEvent.click(screen.getByRole("radio", { name: "Colour blue" }));
    fireEvent.click(screen.getByRole("option", { name: "Star" }));
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
    expect((screen.getByRole("radio", { name: "Colour blue" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole("option", { name: "Star" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Colour red" }));
    expect(onRecolor).toHaveBeenCalledWith("doodle:star:red");
  });

  it("searches doodles and emoji; Enter takes the first match, never the text typed", async () => {
    const onPick = mock();
    render(<IconPicker value="🚀" onPick={onPick} />);
    await settle();
    const search = screen.getByRole("searchbox", { name: "Search icons" });
    act(() => search.focus());
    type(search, "zzzz");
    await settle();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText("No doodle or emoji matches.")).toBeTruthy();
    type(search, "rocket");
    await settle();
    // Both kinds, the open tab's first.
    const options = screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"));
    expect(options[0]).toBe("rocket");
    expect(options).toContain("Rocket");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith("🚀");
  });

  it("Escape is left to the popover once the search is empty", async () => {
    const outside = mock();
    render(
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for the popover
      <div onKeyDown={(event) => event.key === "Escape" && outside()}>
        <IconPicker onPick={mock()} />
      </div>,
    );
    await settle();
    const search = screen.getByRole("searchbox", { name: "Search icons" });
    fireEvent.change(search, { target: { value: "star" } });
    fireEvent.keyDown(search, { key: "Escape" });
    expect((search as HTMLInputElement).value).toBe("");
    expect(outside).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(outside).toHaveBeenCalledTimes(1);
  });
});
