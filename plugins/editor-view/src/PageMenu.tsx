// The page's ••• menu at the top right, as in Notion: page options, then what plugins add to a
// document's menu (the same items as the sidebar's row menu), one section per group.
import { PAGE_FULL_WIDTH_KEY, useApp, useContributions, useOps } from "@lydie/plugin-api";
import type { DocumentMenuItemDef, DocumentRef } from "@lydie/plugin-api";
import {
  Button,
  Menu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
  More1Regular,
  UnfoldHorizontalRegular,
} from "@lydie/plugin-api/ui";
import { Fragment } from "react";

const FULL_WIDTH = "full-width";

// Off removes the key rather than writing `false`, so the frontmatter stays as it was.
export function fullWidthInput(id: string, on: boolean) {
  return on ? { id, set: { [PAGE_FULL_WIDTH_KEY]: true } } : { id, unset: [PAGE_FULL_WIDTH_KEY] };
}

type Item = { id: string; def: DocumentMenuItemDef & { pluginId: string } };

// Groups in the order of their first item (by `order`), items by `order` within a group.
export function menuGroups(items: readonly Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0));
  const groups = new Map<string, Item[]>();
  for (const item of sorted) {
    const key = item.def.group ?? item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

export function PageMenu({ doc, fullWidth }: { doc: DocumentRef; fullWidth: boolean }) {
  const app = useApp();
  const ops = useOps();
  const groups = menuGroups(
    useContributions("documentMenu")
      .filter((m) => !m.when || m.when(doc))
      .map((def) => ({ id: `${def.pluginId}:${def.id}`, def })),
  );
  return (
    <MenuTrigger>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Page options"
        className="shrink-0 text-gray-950/45 hover:text-gray-700"
      >
        <More1Regular className="size-4" />
      </Button>
      <Menu placement="bottom end" popoverClassName="min-w-[220px]">
        <MenuSection
          aria-label="Page options"
          selectionMode="multiple"
          selectedKeys={fullWidth ? [FULL_WIDTH] : []}
          onSelectionChange={(keys) => {
            const on = keys === "all" || keys.has(FULL_WIDTH);
            void ops.doc.setProperties(fullWidthInput(doc.id, on), {
              label: on ? "Full width" : "Default width",
            });
          }}
        >
          <MenuItem id={FULL_WIDTH} indicator="switch" icon={<UnfoldHorizontalRegular />}>
            Full width
          </MenuItem>
        </MenuSection>
        {groups.map((items) => (
          <Fragment key={items[0]!.id}>
            <MenuSeparator />
            <MenuSection items={items}>
              {(item: Item) => (
                <MenuItem
                  id={item.id}
                  icon={item.def.icon}
                  danger={item.def.danger}
                  onAction={() => void item.def.run(doc, app)}
                >
                  {item.def.label}
                </MenuItem>
              )}
            </MenuSection>
          </Fragment>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
