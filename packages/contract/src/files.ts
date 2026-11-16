// `@lydie/contract/files`: the parts of the folder format that read or write YAML (.base files,
// frontmatter, a whole workspace laid out as a folder). Their own entry point because `yaml` is
// large: the main entry point does not load it, so an app or a server starting up does not
// either. Import this where files are read or written, or `await import()` it on first use.
export { fromBase, toBase } from "./database/base-file.ts";
export { frontmatterBlock, planFolder } from "./folder/plan.ts";
