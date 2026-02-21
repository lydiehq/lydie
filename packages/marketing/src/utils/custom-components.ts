import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Flowchart } from "@/components/content/Flowchart";
import { FAQ } from "@/components/generic/FAQ";

export type PillarCalloutType = "definition" | "tip" | "note" | "warning";

export type PillarCalloutProps = {
  type?: PillarCalloutType | string;
  heading?: string;
  body?: string;
};

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

export type FlowchartProps = {
  title?: string;
  nodes?: FlowchartNode[];
  edges?: FlowchartEdge[];
};

export type FAQItem = {
  question: string;
  answer: string;
};

export type FAQProps = {
  title?: string;
  items?: FAQItem[];
};

export function pillarCalloutComponent(properties: Record<string, unknown>): string {
  const type = getString(properties.type) || "note";
  const heading = getString(properties.heading);
  const body = getString(properties.body);

  if (!heading && !body) {
    return "";
  }

  const style = getCalloutStyle(type);

  return `<aside class="my-8 relative">
    <div class="absolute -top-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10"></div>
    <div class="absolute -bottom-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10"></div>
    <div class="absolute -right-1.5 bg-linear-to-t w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10"></div>
    <div class="absolute -left-1.5 bg-linear-to-b w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10"></div>
    <div class="rounded-xl shadow-legit overflow-hidden bg-white p-5 ring ring-black/5">
      <p class="m-0 text-xs font-semibold uppercase tracking-wide ${style.label}">${escapeHtml(type)}</p>
      ${heading ? `<h3 class="mt-2 mb-0 text-lg font-semibold ${style.heading}">${escapeHtml(heading)}</h3>` : ""}
      ${body ? `<p class="mt-2 mb-0 text-sm leading-6 ${style.body}">${escapeHtml(body)}</p>` : ""}
    </div>
  </aside>`;
}

export function flowchartComponent(properties: Record<string, unknown>): string {
  const title = getString(properties.title);
  const nodes = getFlowchartNodes(properties.nodes);
  const edges = getFlowchartEdges(properties.edges);

  if (nodes.length === 0) {
    return "";
  }

  return renderToStaticMarkup(createElement(Flowchart, { title, nodes, edges }));
}

export function faqComponent(properties: Record<string, unknown>): string {
  const title = getString(properties.title).trim() || undefined;
  const items = getFaqItems(properties.items);

  if (items.length === 0) {
    return "";
  }

  return renderToStaticMarkup(createElement(FAQ, { title, items }));
}

function getCalloutStyle(type: string): {
  label: string;
  heading: string;
  body: string;
} {
  switch (type) {
    case "definition":
      return {
        label: "text-sky-700",
        heading: "text-sky-950",
        body: "text-sky-900/90",
      };
    case "tip":
      return {
        label: "text-emerald-700",
        heading: "text-emerald-950",
        body: "text-emerald-900/90",
      };
    case "warning":
      return {
        label: "text-amber-700",
        heading: "text-amber-950",
        body: "text-amber-900/90",
      };
    default:
      return {
        label: "text-slate-700",
        heading: "text-slate-900",
        body: "text-slate-700",
      };
  }
}

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

function getFlowchartNodes(value: unknown): FlowchartNode[] {
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

function getFlowchartEdges(value: unknown): FlowchartEdge[] {
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

function getFaqItems(value: unknown): FAQItem[] {
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
