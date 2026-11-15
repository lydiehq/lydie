import { afterEach, describe, expect, it, mock } from "bun:test";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  AvatarEditor,
  randomScribbleImage,
  scribbleFor,
  scribbleImage,
  SpaceIcon,
  SQUIRCLE_PATH,
} from "../index";

afterEach(() => cleanup());

describe("workspace pictures", () => {
  it("draws a doodle as a squircle picture when asked", () => {
    const choice = scribbleFor("Acme");
    const round = decodeURIComponent(scribbleImage(choice));
    const square = decodeURIComponent(scribbleImage(choice, "squircle"));
    expect(round).not.toContain(SQUIRCLE_PATH);
    expect(square).toContain(SQUIRCLE_PATH);
  });

  it("shows a place's picture cut to the squircle, else its doodle", () => {
    const { container, rerender } = render(<SpaceIcon seed="Acme" image="https://x/y.png" />);
    const image = container.querySelector("image");
    expect(image?.getAttribute("href")).toBe("https://x/y.png");
    const clip = container.querySelector("clipPath");
    expect(image?.getAttribute("clip-path")).toBe(`url(#${clip?.id})`);
    rerender(<SpaceIcon seed="Acme" image={null} />);
    expect(container.querySelector("image")).toBeNull();
  });

  it("saves a picked doodle", async () => {
    const onSave = mock(async (_image: string) => {});
    render(
      <AvatarEditor
        seed="Acme"
        image="https://x/y.png"
        shape="squircle"
        title="Picture"
        description="Shown beside its name."
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose a doodle" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(decodeURIComponent(onSave.mock.calls[0]![0])).toContain(SQUIRCLE_PATH);
  });

  it("shares a drawing only when asked to", async () => {
    const onSave = mock(async (_image: string) => {});
    const onShare = mock(async (_drawing: unknown) => {});
    const draw = () => {
      const canvas = screen.getByLabelText("Drawing area");
      canvas.setPointerCapture = () => {};
      fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });
    };
    render(
      <AvatarEditor
        seed="Ada"
        image={null}
        shape="circle"
        title="Avatar"
        description="Shown next to your name."
        onSave={onSave}
        share={{ label: "Also share it", onShare }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draw your own" }));
    draw();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Draw your own" }));
    draw();
    fireEvent.click(screen.getByRole("checkbox", { name: "Also share it" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onShare.mock.calls[0]![0]).toMatchObject({
      shape: "circle",
      strokes: [expect.any(Array)],
    });
  });

  it("picks a random doodle for a new picture", () => {
    const image = decodeURIComponent(randomScribbleImage("squircle"));
    expect(image).toStartWith("data:image/svg+xml,<svg");
    expect(image).toContain(SQUIRCLE_PATH);
  });

  it("shows the picture without buttons when read-only", () => {
    render(
      <AvatarEditor
        seed="Acme"
        image={null}
        shape="squircle"
        title="Picture"
        description="Owners and admins can change it."
        onSave={async () => {}}
        readOnly
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
