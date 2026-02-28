import type { ContentNode } from "@lydie/core/content";

import type { FAQItem } from "@/components/generic/FAQ";

export type FlowchartNode = {
  id: string;
  type: "question" | "result";
  text: string;
  url?: string;
};

export type FlowchartEdge = {
  from: string;
  to: string;
  label: string;
};

export type ChecklistItem = {
  body: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    return "";
  }

  return "";
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export function normalizeComponentKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getStringProperty(properties: Record<string, unknown>, key: string): string {
  return getString(properties[key]).trim();
}

export function getBooleanProperty(
  properties: Record<string, unknown>,
  key: string,
  defaultValue = false,
): boolean {
  const parsed = getBoolean(properties[key]);
  return parsed === null ? defaultValue : parsed;
}

export function getNumberProperty(properties: Record<string, unknown>, key: string): number | null {
  return getNumber(properties[key]);
}

export function getStringListProperty(properties: Record<string, unknown>, key: string): string[] {
  const value = properties[key];
  const strings: string[] = [];

  const pushValue = (entry: unknown): void => {
    if (typeof entry === "string" || typeof entry === "number") {
      const normalized = String(entry).trim();
      if (normalized) strings.push(normalized);
      return;
    }

    if (!entry || typeof entry !== "object") {
      return;
    }

    const record = entry as Record<string, unknown>;
    const candidates = [record.id, record.templateId, record.slug, record.value];
    for (const candidate of candidates) {
      if (typeof candidate === "string" || typeof candidate === "number") {
        const normalized = String(candidate).trim();
        if (normalized) {
          strings.push(normalized);
          return;
        }
      }
    }
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      pushValue(entry);
    }
  } else if (typeof value === "string") {
    for (const entry of value.split(",")) {
      pushValue(entry);
    }
  }

  return [...new Set(strings)];
}

export function getUrlProperty(properties: Record<string, unknown>, key: string): string {
  return sanitizeUrl(getString(properties[key]).trim() || undefined);
}

export function getChecklistItems(
  properties: Record<string, unknown>,
  key: string,
): ChecklistItem[] {
  const value = properties[key];
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ChecklistItem | null => {
      if (!item || typeof item !== "object") return null;

      const body = getString((item as Record<string, unknown>).body).trim();
      if (!body) return null;

      return { body };
    })
    .filter((item): item is ChecklistItem => Boolean(item));
}

function isRichTextNode(value: unknown): value is ContentNode {
  return value !== null && typeof value === "object" && "type" in value && value.type === "doc";
}

export function getRichTextProperty(
  properties: Record<string, unknown>,
  key: string,
): ContentNode | null {
  const value = properties[key];
  return isRichTextNode(value) ? value : null;
}

export function getFaqItems(value: unknown): FAQItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): FAQItem | null => {
      if (!item || typeof item !== "object") return null;

      const question = getString((item as Record<string, unknown>).question).trim();
      const answer = getString((item as Record<string, unknown>).answer).trim();

      if (!question || !answer) return null;

      return { question, answer };
    })
    .filter((item): item is FAQItem => Boolean(item));
}

export function getFlowchartNodes(value: unknown): FlowchartNode[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): FlowchartNode | null => {
      if (!item || typeof item !== "object") return null;

      const nodeId = getString((item as Record<string, unknown>).id).trim();
      const nodeType = getString((item as Record<string, unknown>).type).trim();
      const nodeText = getString((item as Record<string, unknown>).text).trim();
      const nodeUrl = getString((item as Record<string, unknown>).url).trim();

      if (!nodeId || !nodeText) return null;
      if (nodeType !== "question" && nodeType !== "result") return null;

      return {
        id: nodeId,
        type: nodeType,
        text: nodeText,
        url: sanitizeUrl(nodeUrl || undefined) || undefined,
      };
    })
    .filter((node): node is FlowchartNode => Boolean(node));
}

export function getFlowchartEdges(value: unknown): FlowchartEdge[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): FlowchartEdge | null => {
      if (!item || typeof item !== "object") return null;

      const from = getString((item as Record<string, unknown>).from).trim();
      const to = getString((item as Record<string, unknown>).to).trim();
      const label = getString((item as Record<string, unknown>).label).trim();

      if (!from || !to || !label) return null;

      return { from, to, label };
    })
    .filter((edge): edge is FlowchartEdge => Boolean(edge));
}
