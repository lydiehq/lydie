import { afterEach, describe, expect, it, mock } from "bun:test";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  BoldRegular,
  Button,
  CommandList,
  compose,
  ConfirmDialog,
  EditorBubbleToolbar,
  focusRing,
  formatTimelineTime,
  LinkButton,
  Timeline,
  TimelineEvent,
  WithTooltip,
} from "./index";

afterEach(() => cleanup());

describe("@lydie/ui", () => {
  it("renders Button variants and the pending spinner", () => {
    render(
      <>
        <Button variant="secondary" size="sm">
          Save
        </Button>
        <Button isPending>Busy</Button>
        <LinkButton href="/x">Link</LinkButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("h-7 ");
    expect(
      screen.getByRole("button", { name: "Busy" }).querySelector(".animate-spin"),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Link" }).getAttribute("href")).toBe("/x");
  });

  it("merges variant functions with compose", () => {
    const classes = compose(focusRing)();
    expect(classes).toContain("focus-visible:outline-2");
  });

  it("CommandList shows the active item and reports clicks", () => {
    const onSelect = mock((_index: number) => {});
    render(
      <CommandList
        selectedIndex={1}
        onSelect={onSelect}
        items={[
          { id: "a", title: "Alpha" },
          { id: "b", title: "Beta", description: "Second" },
        ]}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(options[0]!);
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("EditorBubbleToolbar renders actions with pressed state", () => {
    const onPress = mock(() => {});
    render(
      <EditorBubbleToolbar
        items={[{ id: "bold", label: "Bold", icon: <BoldRegular />, isActive: true, onPress }]}
      />,
    );
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });

  it("ConfirmDialog resolves from its buttons and Escape, and closes when the request goes", async () => {
    const onResolve = mock((_confirmed: boolean) => {});
    const request = { message: "Delete it?", detail: "Gone for good.", confirmLabel: "Delete" };
    const { rerender } = render(<ConfirmDialog request={request} onResolve={onResolve} />);
    const dialog = screen.getByRole("alertdialog", { name: "Delete it?" });
    expect(dialog.textContent).toContain("Gone for good.");
    // The dialog takes focus (no button shows a focus ring); Enter there confirms.
    await waitFor(() => expect(document.activeElement === dialog).toBe(true));
    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(onResolve).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onResolve).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onResolve).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onResolve).toHaveBeenLastCalledWith(false);
    expect(onResolve).toHaveBeenCalledTimes(4);

    rerender(<ConfirmDialog request={null} onResolve={onResolve} />);
    // happy-dom runs no exit animation, so the dialog is gone at once; in a browser the last
    // request stays rendered (and inert to presses) until it has animated out.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onResolve).toHaveBeenCalledTimes(4);
  });

  // react-aria shows a tooltip at once on keyboard focus (no hover delay to wait out).
  async function focusByKeyboard(element: HTMLElement) {
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => element.focus());
    fireEvent.keyUp(document.body, { key: "Tab" });
    return screen.findByRole("tooltip");
  }

  it("an icon Button shows its aria-label as a tooltip", async () => {
    render(
      <Button variant="ghost" size="icon-sm" aria-label="New tab">
        <BoldRegular />
      </Button>,
    );
    const tooltip = await focusByKeyboard(screen.getByRole("button", { name: "New tab" }));
    expect(tooltip.textContent).toBe("New tab");
  });

  it("Button shows a tooltip only for icon sizes, unless given one or told not to", async () => {
    render(
      <>
        <Button aria-label="Labelled">Save</Button>
        <Button size="icon-sm" aria-label="Quiet" tooltip={false}>
          <BoldRegular />
        </Button>
        <Button tooltip="Saves the page">Save now</Button>
      </>,
    );
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => screen.getByRole("button", { name: "Labelled" }).focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => screen.getByRole("button", { name: "Quiet" }).focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
    const tooltip = await focusByKeyboard(screen.getByRole("button", { name: /Save now/ }));
    expect(tooltip.textContent).toBe("Saves the page");
  });

  it("WithTooltip labels a plain button and leaves its props alone", async () => {
    const onClick = mock();
    render(
      <WithTooltip label="Close tab">
        <button type="button" tabIndex={-1} aria-label="Close tab" onClick={onClick}>
          <BoldRegular />
        </button>
      </WithTooltip>,
    );
    const button = screen.getByRole("button", { name: "Close tab" });
    expect(button.tabIndex).toBe(-1);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((await focusByKeyboard(button)).textContent).toBe("Close tab");
  });

  it("Timeline shows who, what and when, with the full date in a tooltip", async () => {
    const now = new Date(2026, 10, 15, 12, 0);
    const at = new Date(2026, 10, 15, 11, 50).toISOString();
    render(
      <Timeline>
        <TimelineEvent
          icon={<BoldRegular />}
          actor="Maya"
          action="created Roadmap"
          timestamp={at}
          timeFormat="relative"
          now={now}
          details={<p>More</p>}
        />
        <TimelineEvent icon={<BoldRegular />} action="File sync" timestamp={at} timeFormat="time" />
      </Timeline>,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Maya created Roadmap");
    expect(items[0]!.textContent).toContain("10 minutes ago");
    expect(screen.getByText("More")).not.toBeNull();
    const time = items[0]!.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe(at);
    const tooltip = await focusByKeyboard(time);
    expect(tooltip.textContent).toBe(time.getAttribute("aria-label") ?? "missing label");
  });

  it("formatTimelineTime reads relative, time-only and dated", () => {
    const now = new Date(2026, 10, 15, 12, 0);
    expect(
      formatTimelineTime(new Date(2026, 10, 15, 11, 59, 40).toISOString(), "relative", now),
    ).toBe("Just now");
    expect(formatTimelineTime(new Date(2026, 10, 15, 9, 0).toISOString(), "relative", now)).toBe(
      "3 hours ago",
    );
    expect(formatTimelineTime(new Date(2026, 10, 12, 9, 0).toISOString(), "relative", now)).toMatch(
      /12/,
    );
    expect(formatTimelineTime(new Date(2025, 0, 2).toISOString(), "date", now)).toMatch(/2025/);
    expect(formatTimelineTime("nope", "date", now)).toBe("");
  });
});
