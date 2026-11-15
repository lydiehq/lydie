// The shared value editors (used by the properties panel and the database table), in a DOM.
import { afterEach, describe, expect, mock, test } from "bun:test";

import { BackendProvider } from "@lydie/plugin-api";
import type { Backend } from "@lydie/plugin-api";
import { PropertyEditor, PropertyValueView } from "@lydie/plugin-api/databases";
import type { PropertyLike } from "@lydie/plugin-api/databases";
import { cleanup, fireEvent, render } from "@testing-library/react";

afterEach(cleanup);

const executed: { id: string; input: unknown }[] = [];
const backend = {
  info: { mode: "local", workspaceId: "ws", workspaceName: "Test", persistent: true },
  execute: async (id: string, input: unknown) => {
    executed.push({ id, input });
    return {};
  },
  live: () => ({
    key: "x",
    getSnapshot: () => EMPTY,
    subscribe: () => () => {},
  }),
} as unknown as Backend;
const EMPTY = { data: [], isLoading: false, error: undefined };

const text: PropertyLike = { id: "p1", name: "Notes", key: "Notes", type: "text", config: {} };
const number: PropertyLike = {
  id: "p2",
  name: "Points",
  key: "Points",
  type: "number",
  config: {},
};
const select: PropertyLike = {
  id: "01964000-0000-0000-0000-000000000000",
  name: "Status",
  key: "Status",
  type: "select",
  databaseId: "db",
  config: {
    options: [
      { id: "01JO0000000000000000000001", name: "Todo", color: "gray" },
      { id: "01JO0000000000000000000002", name: "Done", color: "green" },
    ],
  },
};
const tags: PropertyLike = { id: "p4", name: "Tags", key: "Tags", type: "multiSelect", config: {} };

function setup(property: PropertyLike, value: unknown, initialText?: string) {
  const onChange = mock((_v: unknown) => {});
  const onClose = mock((_r: string) => {});
  const view = render(
    <BackendProvider backend={backend}>
      <PropertyEditor
        property={property}
        value={value}
        onChange={onChange}
        onClose={onClose}
        {...(initialText !== undefined ? { initialText } : {})}
      />
    </BackendProvider>,
  );
  return { ...view, onChange, onClose };
}

describe("text editor", () => {
  test("Enter commits and closes; type-to-edit replaces the value", () => {
    const { getByLabelText, onChange, onClose } = setup(text, "old", "n");
    const field = getByLabelText("Notes") as HTMLTextAreaElement;
    expect(field.value).toBe("n");
    fireEvent.change(field, { target: { value: "new" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("new");
    expect(onClose).toHaveBeenCalledWith("commit");
  });

  test("Escape cancels without writing", () => {
    const { getByLabelText, onChange, onClose } = setup(text, "old");
    const field = getByLabelText("Notes");
    fireEvent.change(field, { target: { value: "changed" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith("cancel");
  });

  test("Tab commits and asks to move on", () => {
    const { getByLabelText, onChange, onClose } = setup(text, "", "x");
    fireEvent.keyDown(getByLabelText("Notes"), { key: "Tab", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith("x");
    expect(onClose).toHaveBeenCalledWith("shiftTab");
  });
});

describe("number editor", () => {
  test("parses, and refuses what is not a number", () => {
    const { getByLabelText, getByRole, onChange } = setup(number, 1);
    const field = getByLabelText("Points");
    fireEvent.change(field, { target: { value: "abc" } });
    expect(getByRole("alert").textContent).toBe("Not a number");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "1,250" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(1250);
  });
});

describe("option editors", () => {
  test("select: filter, pick with Enter, create a new option", () => {
    const { getByRole, onChange, onClose } = setup(select, null);
    const box = getByRole("combobox");
    fireEvent.change(box, { target: { value: "do" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("Todo");
    expect(onClose).toHaveBeenCalledWith("commit");
    fireEvent.change(box, { target: { value: "Blocked" } });
    const create = getByRole("option", { name: /Create/ });
    fireEvent.click(create);
    expect(onChange).toHaveBeenLastCalledWith("Blocked");
  });

  test("select: recolouring an option is an operation", () => {
    executed.length = 0;
    const { getByLabelText } = setup(select, "Todo");
    fireEvent.click(getByLabelText("Colour of Done"));
    fireEvent.click(getByLabelText("blue"));
    expect(executed).toEqual([
      {
        id: "database.updateOption",
        input: { propertyId: select.id, optionId: "01JO0000000000000000000002", color: "blue" },
      },
    ]);
  });

  test("multi-select toggles and removes with Backspace", () => {
    const { getByRole, onChange } = setup(tags, ["a", "b"]);
    const box = getByRole("combobox");
    fireEvent.keyDown(box, { key: "Backspace" });
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
    fireEvent.change(box, { target: { value: "c" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
  });
});

describe("value view", () => {
  test("options as pills, checkboxes as state, dates formatted", () => {
    const { getByText, getByRole } = render(
      <BackendProvider backend={backend}>
        <PropertyValueView property={select} value="Done" />
        <PropertyValueView
          property={{ id: "c", name: "Done", key: "Done", type: "checkbox", config: {} }}
          value={true}
        />
        <PropertyValueView
          property={{ id: "d", name: "Due", key: "Due", type: "date", config: {} }}
          value="2026-11-13/2026-11-15"
        />
      </BackendProvider>,
    );
    expect(getByText("Done").className).toContain("green");
    expect(getByRole("img", { name: "Checked" })).toBeDefined();
    expect(getByText("Nov 13, 2026 → Nov 15, 2026")).toBeDefined();
  });
});
