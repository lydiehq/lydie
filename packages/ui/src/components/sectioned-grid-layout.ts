import { Layout, LayoutInfo, Rect, Size } from "react-aria-components";
import type { Key } from "react-aria-components";

export type SectionedGridLayoutOptions = {
  // Cells per row, each `cellSize` square, centred in its column.
  columns: number;
  cellSize: number;
  headerHeight: number;
};

type CollectionNode = { key: Key; type: string };

// React Aria's GridLayout has no sections and its ListLayout has one column: this is a grid of
// fixed-size cells in sections, each with its header across the top, for a `Virtualizer` around a
// `ListBox layout="grid"` (the icon picker's two thousand emoji). Everything is laid out up front,
// which is only rectangles; the virtualizer renders what is in view. The grid's keyboard
// navigation reads the cells' places from here.
// `Layout`'s defaults: React Aria's collection node (not exported) and any options.
export class SectionedGridLayout extends Layout {
  private infos = new Map<Key, LayoutInfo>();
  private roots: LayoutInfo[] = [];
  private childInfos = new Map<Key, LayoutInfo[]>();
  private size = new Size();

  override shouldInvalidateLayoutOptions(
    next: SectionedGridLayoutOptions,
    prev: SectionedGridLayoutOptions,
  ): boolean {
    return (
      next.columns !== prev.columns ||
      next.cellSize !== prev.cellSize ||
      next.headerHeight !== prev.headerHeight
    );
  }

  override update(context: { layoutOptions?: SectionedGridLayoutOptions | null }): void {
    const virtualizer = this.virtualizer;
    if (!virtualizer) return;
    const { columns = 8, cellSize = 36, headerHeight = 28 } = context.layoutOptions ?? {};
    const collection = virtualizer.collection as unknown as Iterable<CollectionNode> & {
      getChildren?: (key: Key) => Iterable<CollectionNode>;
    };
    const width = virtualizer.size.width;
    const column = width / columns;
    const infos = new Map<Key, LayoutInfo>();
    const roots: LayoutInfo[] = [];
    const childInfos = new Map<Key, LayoutInfo[]>();
    let y = 0;
    let col = 0;
    const endRow = () => {
      if (col > 0) y += cellSize;
      col = 0;
    };
    const place = (node: CollectionNode, parentKey: Key | null): LayoutInfo | null => {
      let rect: Rect;
      if (node.type === "header") {
        endRow();
        rect = new Rect(0, y, width, headerHeight);
        y += headerHeight;
      } else if (node.type === "item") {
        rect = new Rect(col * column + (column - cellSize) / 2, y, cellSize, cellSize);
        col += 1;
        if (col === columns) endRow();
      } else {
        return null;
      }
      const info = new LayoutInfo(node.type, node.key, rect);
      info.parentKey = parentKey;
      infos.set(node.key, info);
      return info;
    };
    for (const node of collection) {
      if (node.type !== "section") {
        const info = place(node, null);
        if (info) roots.push(info);
        continue;
      }
      endRow();
      const top = y;
      const kids: LayoutInfo[] = [];
      for (const child of collection.getChildren?.(node.key) ?? []) {
        const info = place(child, node.key);
        if (info) kids.push(info);
      }
      endRow();
      const section = new LayoutInfo("section", node.key, new Rect(0, top, width, y - top));
      infos.set(node.key, section);
      roots.push(section);
      childInfos.set(node.key, kids);
    }
    endRow();
    this.infos = infos;
    this.roots = roots;
    this.childInfos = childInfos;
    this.size = new Size(width, y);
  }

  override getVisibleLayoutInfos(rect: Rect): LayoutInfo[] {
    const kept = (info: LayoutInfo) =>
      info.rect.intersects(rect) || this.virtualizer?.isPersistedKey(info.key) === true;
    const out: LayoutInfo[] = [];
    for (const root of this.roots) {
      const kids = (this.childInfos.get(root.key) ?? []).filter(kept);
      if (kept(root) || kids.length > 0) out.push(root, ...kids);
    }
    return out;
  }

  override getLayoutInfo(key: Key): LayoutInfo | null {
    return this.infos.get(key) ?? null;
  }

  override getContentSize(): Size {
    return this.size;
  }
}
