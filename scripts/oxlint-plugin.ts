// Lydie's own lint rules, loaded by oxlint as a JS plugin (`jsPlugins` in .oxlintrc.json).
//
// lydie/icon-button-tooltip: a button that shows only an icon needs a tooltip, or nobody can tell
// what it does without pressing it.
//   - `<Button>`: an icon size (`size="icon-sm"`) shows its `aria-label` as the tooltip, so it must
//     have one (or `tooltip`). Icon-only content at another size must pass `tooltip`.
//     `tooltip={false}` opts out.
//   - `<button>`, `<LinkButton>`, `role="button"`: wrap it in `<WithTooltip label="…">` (or a
//     `<TooltipTrigger>`).
// "Only an icon" is read from the JSX: at least one icon element and no text. Content the rule
// cannot see into (`{children}`, another component) counts as text.

// The parts of the ESTree JSX nodes the rule reads; oxlint passes plain ESTree objects.
type Node = {
  type: string;
  parent?: Node;
  name?: Node | string;
  object?: Node;
  property?: Node;
  value?: Node | string | number | boolean | null;
  expression?: Node;
  openingElement?: Node;
  attributes?: Node[];
  children?: Node[];
  consequent?: Node;
  alternate?: Node;
  left?: Node;
  right?: Node;
  operator?: string;
  quasis?: Node[];
  expressions?: Node[];
};

type Context = { report(descriptor: { node: Node; message: string }): void };

const BUTTONS = new Set(["Button", "LinkButton", "button"]);
const TOOLTIP_WRAPPERS = new Set(["TooltipTrigger", "WithTooltip"]);
// MingCute icons end in Regular/Filled; the app's own end in Icon. CollapseArrow is the caret.
const ICON_NAME = /(?:Icon|Regular|Filled|Arrow|Grip)$/;
const ICON_ELEMENTS = new Set(["svg", "img"]);
const ICON_VARIABLE = /icon|glyph/i;

function elementName(element: Node): string {
  let name = element.openingElement?.name as Node | undefined;
  // <Icons.Add />: the last part names the component.
  while (name?.type === "JSXMemberExpression") name = name.property;
  return typeof name?.name === "string" ? name.name : "";
}

function attribute(element: Node, name: string): Node | undefined {
  return element.openingElement?.attributes?.find(
    (a) => a.type === "JSXAttribute" && (a.name as Node | undefined)?.name === name,
  );
}

function hasSpread(element: Node) {
  return element.openingElement?.attributes?.some((a) => a.type === "JSXSpreadAttribute") ?? false;
}

function stringValue(attr: Node | undefined): string | undefined {
  let value = attr?.value as Node | undefined;
  if (value?.type === "JSXExpressionContainer") value = value.expression;
  return value?.type === "Literal" && typeof value.value === "string" ? value.value : undefined;
}

type Content = { icon: boolean; text: boolean };

const NOTHING: Content = { icon: false, text: false };
const TEXT: Content = { icon: false, text: true };
const ICON: Content = { icon: true, text: false };

function either(a: Content, b: Content): Content {
  return { icon: a.icon || b.icon, text: a.text || b.text };
}

function contentOfChildren(children: Node[] | undefined): Content {
  return (children ?? []).map(contentOf).reduce(either, NOTHING);
}

function contentOfExpression(node: Node | undefined): Content {
  switch (node?.type) {
    case undefined:
    case "JSXEmptyExpression":
      return NOTHING;
    case "JSXElement":
    case "JSXFragment":
      return contentOf(node);
    case "Literal":
      return typeof node.value === "string" || typeof node.value === "number" ? TEXT : NOTHING;
    case "ConditionalExpression":
      return either(contentOfExpression(node.consequent), contentOfExpression(node.alternate));
    case "LogicalExpression":
      return node.operator === "&&"
        ? contentOfExpression(node.right)
        : either(contentOfExpression(node.left), contentOfExpression(node.right));
    case "Identifier":
      return ICON_VARIABLE.test(String(node.name)) ? ICON : TEXT;
    case "MemberExpression": {
      const property = node.property;
      return property?.type === "Identifier" && ICON_VARIABLE.test(String(property.name))
        ? ICON
        : TEXT;
    }
    default:
      return TEXT;
  }
}

function contentOf(node: Node): Content {
  switch (node.type) {
    case "JSXText":
      return typeof node.value === "string" && node.value.trim() ? TEXT : NOTHING;
    case "JSXExpressionContainer":
      return contentOfExpression(node.expression);
    case "JSXFragment":
      return contentOfChildren(node.children);
    case "JSXElement": {
      const name = elementName(node);
      if (ICON_ELEMENTS.has(name) || ICON_NAME.test(name)) return ICON;
      // Text for screen readers only does not label the button for anyone looking at it.
      if (stringValue(attribute(node, "className"))?.split(/\s+/).includes("sr-only")) {
        return NOTHING;
      }
      const isComponent = /^[A-Z]/.test(name);
      if (isComponent && !node.children?.length) return TEXT;
      return contentOfChildren(node.children);
    }
    default:
      return NOTHING;
  }
}

function insideTooltip(node: Node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "JSXElement" && TOOLTIP_WRAPPERS.has(elementName(parent))) return true;
  }
  return false;
}

const iconButtonTooltip = {
  meta: {
    type: "problem",
    docs: { description: "Buttons that show only an icon need a tooltip." },
  },
  create(context: Context) {
    return {
      JSXElement(node: Node) {
        const name = elementName(node);
        const isButton = BUTTONS.has(name) || stringValue(attribute(node, "role")) === "button";
        if (!isButton) return;

        const content = contentOfChildren(node.children);
        const iconOnly = content.icon && !content.text;

        if (name === "Button") {
          const size = attribute(node, "size");
          const iconSize = stringValue(size)?.startsWith("icon-") ?? false;
          if (!iconOnly && !iconSize) return;
          if (attribute(node, "tooltip") || hasSpread(node) || insideTooltip(node)) return;
          // A size the rule cannot read may be an icon size, which shows the label.
          const showsLabel = iconSize || (size !== undefined && stringValue(size) === undefined);
          if (showsLabel && attribute(node, "aria-label")) return;
          context.report({
            node: node.openingElement ?? node,
            message: iconSize
              ? "An icon button needs an `aria-label` (shown as its tooltip) or a `tooltip`. Opt out with `tooltip={false}`."
              : "This button shows only an icon: give it a `tooltip` (or `tooltip={false}` to opt out).",
          });
          return;
        }

        if (!iconOnly || insideTooltip(node)) return;
        context.report({
          node: node.openingElement ?? node,
          message:
            'This button shows only an icon: wrap it in `<WithTooltip label="…">` (from @lydie/ui), or use `<Button size="icon-…">`, which shows its `aria-label` as a tooltip.',
        });
      },
    };
  },
};

export default {
  meta: { name: "lydie" },
  rules: { "icon-button-tooltip": iconButtonTooltip },
};
