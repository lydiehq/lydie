import type { Schema } from "@tiptap/pm/model";

export type NodeDescription = {
  group: string | null;
  content: string | null;
  inline: boolean;
  atom: boolean;
  marks: string | null;
  attrs: Record<string, unknown>;
};

// A plain-data summary of a schema: what the schema snapshot test pins, and what @lydie/markdown
// can compare itself against.
export function describeSchema(schema: Schema) {
  const nodes: Record<string, NodeDescription> = {};
  for (const [name, type] of Object.entries(schema.nodes)) {
    nodes[name] = {
      group: type.spec.group ?? null,
      content: type.spec.content ?? null,
      inline: type.isInline,
      atom: type.isAtom,
      marks: type.spec.marks ?? null,
      attrs: Object.fromEntries(
        Object.entries(type.spec.attrs ?? {}).map(([key, spec]) => [key, spec.default ?? null]),
      ),
    };
  }
  const marks: Record<string, Record<string, unknown>> = {};
  for (const [name, type] of Object.entries(schema.marks)) {
    marks[name] = Object.fromEntries(
      Object.entries(type.spec.attrs ?? {}).map(([key, spec]) => [key, spec.default ?? null]),
    );
  }
  return { topNode: schema.topNodeType.name, nodes, marks };
}
