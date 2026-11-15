import { afterEach, describe, expect, it } from "bun:test";

import type { TreeEntry } from "@lydie/contract";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";

import { StoreProvider, useDoc, useSearch, useTree } from "./react.tsx";
import { closeTestStores, openTestStore } from "./test-utils.ts";

const WS = "ws1";

afterEach(async () => {
  cleanup();
  await closeTestStores();
});

const renders = new Map<string, number>();

const Row = memo(function Row({ entry }: { entry: TreeEntry }) {
  renders.set(entry.id, (renders.get(entry.id) ?? 0) + 1);
  return <li>{entry.title}</li>;
});

function Tree() {
  const { data, isLoading } = useTree(WS);
  if (isLoading) return <p>loading</p>;
  return (
    <ul aria-label="tree">
      {data.map((entry) => (
        <Row key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function Title({ id }: { id: string }) {
  const { data } = useDoc(id);
  return <h1>{data?.document.title ?? "…"}</h1>;
}

function Hits({ query }: { query: string }) {
  const { data } = useSearch(WS, query);
  return <p>hits: {data.map((h) => h.title).join(",")}</p>;
}

describe("React bindings", () => {
  it("update on change and re-render only changed rows", async () => {
    const { store, runtime } = await openTestStore();
    const a = await runtime.ops.doc.create({ workspaceId: WS, title: "Alpha" });
    render(
      <StoreProvider store={store}>
        <Tree />
        <Title id={a.id} />
        <Hits query="bet" />
      </StoreProvider>,
    );
    await screen.findByText("Alpha", { selector: "li" });
    expect(screen.getByRole("heading").textContent).toBe("Alpha");

    const b = await act(() => runtime.ops.doc.create({ workspaceId: WS, title: "Beta" }));
    await screen.findByText("Beta", { selector: "li" });
    await waitFor(() => expect(screen.getByText(/^hits:/).textContent).toBe("hits: Beta"));
    const alphaRenders = renders.get(a.id);

    await act(() => runtime.ops.doc.rename({ id: b.id, title: "Beta 2" }));
    await screen.findByText("Beta 2", { selector: "li" });
    // Alpha's row object kept its identity, so the memoised row did not render again.
    expect(renders.get(a.id)).toBe(alphaRenders);

    await act(() => runtime.ops.doc.rename({ id: a.id, title: "Alpha 2" }));
    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe("Alpha 2"));
  });
});
