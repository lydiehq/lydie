// The tab being dragged, as browsers do it: the tab itself follows the pointer. Over a tab row it
// docks into the row and the other tabs move aside for it; elsewhere it floats under the pointer.
// The drag is a native one (a drop also lands on split zones and other windows), with its drag
// image hidden; this store only says where the tab is drawn. One drag at a time, so module state.

// What the tab rows render from. Changes when the tab changes slot, not as it moves.
export type TabDragStrip = {
  tabId: string;
  sourceGroupId: string;
  width: number;
  // The row the tab is docked in and its slot among that row's other tabs.
  overGroupId: string | null;
  index: number;
  // False for the first frame: the tab leaves the flow and its neighbours take up their shift
  // at once, without a transition.
  settled: boolean;
};

// Where the dragged tab is drawn, in viewport coordinates. Changes with every pointer move.
export type TabDragPosition = { left: number; top: number; width: number; docked: boolean };

type Drag = {
  tabId: string;
  sourceGroupId: string;
  width: number;
  height: number;
  // The pointer's offset in the tab where it was picked up.
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  overGroupId: string | null;
  index: number;
  dockLeft: number;
  dockTop: number;
  settled: boolean;
};

export type ActiveTabDrag = Pick<Drag, "tabId" | "width" | "height" | "grabX">;

let drag: Drag | null = null;
let strip: TabDragStrip | null = null;
let position: TabDragPosition | null = null;
let frame = 0;
// The tab whose drag just ended: where it lands it is not a newly opened tab.
let landed: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  if (!drag) {
    strip = null;
    position = null;
  } else {
    if (
      !strip ||
      strip.overGroupId !== drag.overGroupId ||
      strip.index !== drag.index ||
      strip.settled !== drag.settled
    ) {
      strip = {
        tabId: drag.tabId,
        sourceGroupId: drag.sourceGroupId,
        width: drag.width,
        overGroupId: drag.overGroupId,
        index: drag.index,
        settled: drag.settled,
      };
    }
    const docked = drag.overGroupId !== null;
    const left = docked ? drag.dockLeft : drag.x - drag.grabX;
    const top = docked ? drag.dockTop : drag.y - drag.grabY;
    if (!position || position.left !== left || position.top !== top || position.docked !== docked) {
      position = { left, top, width: drag.width, docked };
    }
  }
  for (const listener of listeners) listener();
}

function onDragOver(event: globalThis.DragEvent) {
  if (!drag) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (drag.overGroupId === null) emit();
}

// After the drop's own handlers, which end the drag together with the layout change. This also
// covers a drag that ends outside every target.
function onDragDone() {
  setTimeout(end, 0);
}

function end() {
  cancelAnimationFrame(frame);
  document.removeEventListener("dragover", onDragOver, true);
  document.removeEventListener("drop", onDragDone, true);
  document.removeEventListener("dragend", onDragDone, true);
  if (!drag) return;
  const tabId = drag.tabId;
  landed = tabId;
  setTimeout(() => {
    if (landed === tabId) landed = null;
  }, 500);
  drag = null;
  emit();
}

export const tabDrag = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  strip: () => strip,
  position: () => position,
  active: (): ActiveTabDrag | null => drag,
  landed: (tabId: string) => landed === tabId,

  // From the tab's dragstart. The tab is taken out of the row a frame later: changing the drag
  // source during dragstart can cancel the drag.
  start(init: {
    tabId: string;
    groupId: string;
    index: number;
    rect: { left: number; top: number; width: number; height: number };
    x: number;
    y: number;
  }) {
    end();
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDragDone, true);
    document.addEventListener("dragend", onDragDone, true);
    frame = requestAnimationFrame(() => {
      drag = {
        tabId: init.tabId,
        sourceGroupId: init.groupId,
        width: init.rect.width,
        height: init.rect.height,
        grabX: init.x - init.rect.left,
        grabY: init.y - init.rect.top,
        x: init.x,
        y: init.y,
        overGroupId: init.groupId,
        index: init.index,
        dockLeft: init.rect.left,
        dockTop: init.rect.top,
        settled: false,
      };
      emit();
      frame = requestAnimationFrame(() => {
        if (!drag) return;
        drag.settled = true;
        emit();
      });
    });
  },

  // The pointer is over a tab row: the tab sits in it at `index`, drawn at `left`, `top`.
  dock(groupId: string, place: { index: number; left: number; top: number }) {
    if (!drag) return;
    drag.overGroupId = groupId;
    drag.index = place.index;
    drag.dockLeft = place.left;
    drag.dockTop = place.top;
    emit();
  },

  // The pointer left that row.
  undock(groupId: string) {
    if (!drag || drag.overGroupId !== groupId) return;
    drag.overGroupId = null;
    emit();
  },

  end,
};

// The dragged tab is drawn by the app, so the browser's own drag image is an empty one. It has
// to be an image that has already loaded: an element outside the document is not drawn, and the
// browser then falls back to its snapshot of the tab.
const EMPTY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
let emptyImage: HTMLImageElement | null = null;

// Called when a tab is pressed, so the image is ready by the time the drag starts.
export function prepareDragImage() {
  if (emptyImage || typeof Image === "undefined") return;
  emptyImage = new Image();
  emptyImage.src = EMPTY_GIF;
}

export function hideDragImage(dataTransfer: DataTransfer) {
  if (typeof dataTransfer.setDragImage !== "function") return;
  prepareDragImage();
  if (emptyImage) dataTransfer.setDragImage(emptyImage, 0, 0);
}
