// `@lydie/plugin-api/grid`: a generic engine for spreadsheet-like grids (tables, and later boards
// and lists that share its selection and keyboard model). Plain TypeScript plus one React hook:
// virtualiser, geometry, selection, the interaction state machine and its external store, the key
// map, clipboard (TSV and HTML tables), type-aware text parsing and fill series.
export * from "./clipboard.ts";
export * from "./fill.ts";
export * from "./geometry.ts";
export * from "./keys.ts";
export * from "./machine.ts";
export * from "./parse.ts";
export { useStoreSelector } from "./react.ts";
export * from "./selection.ts";
export * from "./store.ts";
export * from "./virtual.ts";
