// Words for the import dialog: what a plan brings in and what step a run is at.
import type { ImportPhase, ImportPlan } from "@lydie/plugin-api";

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// "120 pages, 3 collections with 80 pages in them, and 40 files (12.3 MB)."
export function describePlan(plan: ImportPlan): string {
  const collections = plan.pages.filter((p) => p.database);
  const ids = new Set(collections.map((c) => c.id));
  const rows = plan.pages.filter((p) => p.parentId && ids.has(p.parentId)).length;
  const pages = plan.pages.length - collections.length - rows;
  const parts = [plural(pages, "page")];
  if (collections.length) {
    parts.push(
      `${plural(collections.length, "collection")}${rows ? ` with ${plural(rows, "page")} in them` : ""}`,
    );
  }
  if (plan.files.length) {
    const bytes = plan.files.reduce((sum, f) => sum + f.size, 0);
    parts.push(`${plural(plan.files.length, "file")} (${formatBytes(bytes)})`);
  }
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `This imports ${list}.`;
}

const PHASES: Record<ImportPhase, string> = {
  pages: "Creating pages",
  databases: "Setting up collections",
  bodies: "Writing the pages",
  files: "Adding files",
  values: "Filling in properties",
};

export const phaseLabel = (phase: ImportPhase) => PHASES[phase];
