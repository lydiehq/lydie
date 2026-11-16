import { expect, test } from "bun:test";

import type { Attachment } from "@lydie/contract";
import { renderToString } from "react-dom/server";

import { useAttachmentNamed } from "./attachments.ts";
import type { Backend, LiveState } from "./backend.ts";
import { BackendProvider } from "./react.tsx";

const attachment = (id: string, filename: string) => ({ id, filename }) as Attachment;

function backendWith(state: LiveState<Attachment>) {
  return {
    info: { mode: "local", workspaceId: "ws", workspaceName: "W", persistent: true },
    live: () => ({ key: "attachment.list", getSnapshot: () => state, subscribe: () => () => {} }),
  } as unknown as Backend;
}

function Probe({ filename }: { filename: string | null }) {
  const { attachment, isLoading } = useAttachmentNamed(filename);
  return isLoading ? "loading" : (attachment?.id ?? "none");
}

const show = (state: LiveState<Attachment>, filename: string | null) =>
  renderToString(
    <BackendProvider backend={backendWith(state)}>
      <Probe filename={filename} />
    </BackendProvider>,
  );

test("an attachment by file name: case-insensitive, from a path, the first of a name", () => {
  const state: LiveState<Attachment> = {
    data: [
      attachment("a", "Cover.PNG"),
      attachment("b", "notes.pdf"),
      attachment("c", "cover.png"),
    ],
    isLoading: false,
    error: undefined,
  };
  expect(show(state, "cover.png")).toBe("a");
  expect(show(state, "assets/Notes.pdf")).toBe("b");
  expect(show(state, "missing.png")).toBe("none");
  expect(show(state, null)).toBe("none");
  expect(show({ data: [], isLoading: true, error: undefined }, "cover.png")).toBe("loading");
});
