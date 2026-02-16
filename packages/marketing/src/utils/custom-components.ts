/**
 * Custom component renderers for the marketing site
 * These handle the documentComponent nodes from Lydie and render them as HTML
 */

export interface LinkGridProps {
  links?: Array<{
    title?: string;
    href?: string;
    icon?: string;
    description?: string;
  }>;
}

export interface ComparisonGridProps {
  items?: Array<{
    label?: string;
    description?: string;
    icon?: string;
  }>;
  columns?: number;
}

/**
 * Render a link grid component
 * Usage in Lydie: Create a component named "link-grid" with a "links" property of type array
 */
export function linkGridComponent(properties: Record<string, any>): string {
  const links: LinkGridProps["links"] = properties.links || [];

  if (!links || links.length === 0) {
    return '<div class="my-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">[Link Grid: No links configured]</div>';
  }

  const linksHtml = links.map((link) => {
    const href = link.href || "#";
    const title = link.title || "Untitled";
    const description = link.description || "";
    const icon = link.icon || "";
    
    return `
      <a href="${escapeHtml(href)}" class="group block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500/50 hover:shadow-md transition-all">
        <div class="flex items-start gap-3">
          ${icon ? `<span class="text-2xl">${escapeHtml(icon)}</span>` : ""}
          <div class="flex-1">
            <h3 class="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
              ${escapeHtml(title)}
            </h3>
            ${description ? `<p class="text-sm text-gray-600 mt-1">${escapeHtml(description)}</p>` : ""}
          </div>
        </div>
      </a>
    `;
  }).join("");

  return `
    <div class="my-8 grid md:grid-cols-2 gap-4">
      ${linksHtml}
    </div>
  `;
}

/**
 * Render a comparison grid component
 * Usage in Lydie: Create a component named "comparison-grid" with items and columns properties
 */
export function comparisonGridComponent(properties: Record<string, any>): string {
  const items: ComparisonGridProps["items"] = properties.items || [];
  const columns = properties.columns || 2;

  if (!items || items.length === 0) {
    return '<div class="my-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">[Comparison Grid: No items configured]</div>';
  }

  const gridClass = columns === 2 ? "md:grid-cols-2" : columns === 3 ? "md:grid-cols-3" : "md:grid-cols-1";

  const itemsHtml = items.map((item) => {
    const label = item.label || "";
    const description = item.description || "";
    const icon = item.icon || "";
    
    return `
      <div class="p-4 bg-white border border-gray-200 rounded-lg">
        <div class="flex items-start gap-3">
          ${icon ? `<span class="text-xl">${escapeHtml(icon)}</span>` : ""}
          <div class="flex-1">
            <h3 class="font-medium text-gray-900">${escapeHtml(label)}</h3>
            ${description ? `<p class="text-sm text-gray-600 mt-1">${escapeHtml(description)}</p>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="my-8 grid ${gridClass} gap-4">
      ${itemsHtml}
    </div>
  `;
}

/**
 * Render a visual framework component
 * Usage in Lydie: Create a component named "visual-framework" with title and description
 */
export function visualFrameworkComponent(properties: Record<string, any>): string {
  const title = properties.title || "";
  const description = properties.description || "";
  
  return `
    <div class="my-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl">
      ${title ? `<h3 class="text-lg font-semibold text-gray-900 mb-2">${escapeHtml(title)}</h3>` : ""}
      ${description ? `<p class="text-gray-600">${escapeHtml(description)}</p>` : ""}
      <div class="mt-4">
        ${properties.content || "[Visual Framework Content]"}
      </div>
    </div>
  `;
}

/**
 * Render a flow steps component
 * Usage in Lydie: Create a component named "flow-steps" with steps array
 */
export function flowStepsComponent(properties: Record<string, any>): string {
  const steps = properties.steps || [];
  const direction = properties.direction || "horizontal";
  
  if (steps.length === 0) {
    return '<div class="my-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">[Flow Steps: No steps configured]</div>';
  }

  const isHorizontal = direction === "horizontal";
  const containerClass = isHorizontal 
    ? "flex flex-col md:flex-row gap-4" 
    : "flex flex-col gap-4";

  const stepsHtml = steps.map((step: any, index: number) => {
    const title = step.title || "";
    const description = step.description || "";
    const stepNumber = index + 1;
    
    return `
      <div class="flex-1 relative">
        <div class="p-4 bg-white border border-gray-200 rounded-lg h-full">
          <div class="flex items-center gap-3 mb-2">
            <span class="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
              ${stepNumber}
            </span>
            <h4 class="font-medium text-gray-900">${escapeHtml(title)}</h4>
          </div>
          ${description ? `<p class="text-sm text-gray-600">${escapeHtml(description)}</p>` : ""}
        </div>
        ${isHorizontal && index < steps.length - 1 ? `
          <div class="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 text-gray-300">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="my-8 ${containerClass}">
      ${stepsHtml}
    </div>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
