import { useState } from "react";

import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { WithTooltip } from "../components/Tooltip";
import { Avatar, SpaceIcon } from "./Avatar";
import { ScribbleIcon } from "./Scribble";
import { ScribbleCanvas } from "./ScribbleCanvas";
import {
  drawnScribbleImage,
  SCRIBBLE_PENS,
  scribbleFor,
  scribbleImage,
  SCRIBBLES,
} from "./scribbles";
import type { ScribblePoint, ScribbleShape } from "./scribbles";

type Mode = "view" | "pick" | "draw";

type Props = {
  // What the doodle's wobble and the first pick are seeded by (a user id, a workspace's name).
  seed: string;
  image: string | null;
  // "circle" for a person, "squircle" for a place.
  shape: ScribbleShape;
  title: string;
  // Shown under the title while no doodle is being picked or drawn.
  description: string;
  // Saves the picture. On a rejection the editor stays open; the caller says what went wrong.
  onSave: (image: string) => Promise<void>;
  // Shows the picture without the buttons (no permission to change it).
  readOnly?: boolean;
  size?: number;
  // Offers to share a drawing too (a checkbox under it, off by default). Called after a drawing is
  // saved; on a rejection the caller says what went wrong, and the picture stays saved.
  share?: { label: string; onShare: (drawing: ScribbleDrawing) => Promise<void> };
};

export type ScribbleDrawing = { strokes: ScribblePoint[][]; pen: string; shape: ScribbleShape };

// A picture, large, with a choice of the doodles or one of the person's own drawing. The account's
// avatar and a workspace's picture.
export function AvatarEditor({
  seed,
  image,
  shape,
  title,
  description,
  onSave,
  readOnly = false,
  size = 96,
  share,
}: Props) {
  const generated = scribbleFor(seed);
  const [mode, setMode] = useState<Mode>("view");
  const [scribble, setScribble] = useState(generated.scribble);
  const [pen, setPen] = useState(generated.pen);
  const [strokes, setStrokes] = useState<ScribblePoint[][]>([]);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const picked = { scribble, pen, seed };
  const save = async (next: string) => {
    setSaving(true);
    // The caller says why it failed; then what was picked or drawn stays. (Not `try`: the React
    // Compiler skips a component with a condition inside one.)
    const saved = await onSave(next).then(
      () => true,
      () => false,
    );
    if (saved) {
      if (share && sharing && mode === "draw") {
        await share.onShare({ strokes, pen, shape }).catch(() => {});
      }
      setMode("view");
      setStrokes([]);
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5">
        {mode === "draw" ? (
          <ScribbleCanvas
            strokes={strokes}
            onChange={setStrokes}
            pen={pen}
            shape={shape}
            size={size * 1.6}
          />
        ) : mode === "pick" ? (
          <ScribbleIcon choice={picked} shape={shape} size={size} />
        ) : shape === "circle" ? (
          <Avatar seed={seed} image={image} size={size} />
        ) : (
          <SpaceIcon seed={seed} image={image} size={size} />
        )}
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{title}</p>
            <p className="text-sm text-gray-500">
              {mode === "draw"
                ? "Draw with your mouse, trackpad or pen."
                : mode === "pick"
                  ? "Pick a doodle and a pen."
                  : description}
            </p>
          </div>
          {readOnly ? null : mode === "view" ? (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onPress={() => setMode("pick")}>
                Choose a doodle
              </Button>
              <Button size="sm" variant="secondary" onPress={() => setMode("draw")}>
                Draw your own
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                isPending={saving}
                isDisabled={mode === "draw" && strokes.length === 0}
                onPress={() =>
                  void save(
                    mode === "pick"
                      ? scribbleImage(picked, shape)
                      : drawnScribbleImage(strokes, pen, shape),
                  )
                }
              >
                Save
              </Button>
              {mode === "draw" && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={strokes.length === 0}
                    onPress={() => setStrokes(strokes.slice(0, -1))}
                  >
                    Undo
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={strokes.length === 0}
                    onPress={() => setStrokes([])}
                  >
                    Clear
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  setMode("view");
                  setStrokes([]);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {mode !== "view" && (
        <div className="flex flex-col gap-3">
          {mode === "pick" && (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Doodles</legend>
              {SCRIBBLES.map((option) => (
                <WithTooltip key={option.id} label={option.name}>
                  <button
                    type="button"
                    aria-label={option.name}
                    aria-pressed={option.id === scribble.id}
                    onClick={() => setScribble(option)}
                    className={
                      shape === "circle"
                        ? "rounded-full outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-gray-800"
                        : "rounded-[30%] outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-gray-800"
                    }
                  >
                    <ScribbleIcon
                      choice={{ scribble: option, pen, seed }}
                      shape={shape}
                      size={36}
                    />
                  </button>
                </WithTooltip>
              ))}
            </fieldset>
          )}
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Pens</legend>
            {SCRIBBLE_PENS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Pen ${color}`}
                aria-pressed={color === pen}
                onClick={() => setPen(color)}
                className="size-5 rounded-full outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-gray-800"
                style={{ background: color }}
              />
            ))}
          </fieldset>
          {mode === "draw" && share && (
            <Checkbox isSelected={sharing} onChange={setSharing}>
              {share.label}
            </Checkbox>
          )}
        </div>
      )}
    </div>
  );
}
