import "@testing-library/jest-dom/vitest";

/**
 * DOM mocks required for TipTap/ProseMirror testing.
 *
 * ProseMirror relies on DOM layout APIs that aren't available in jsdom.
 * These mocks provide the minimal implementation needed for tests to run.
 *
 * @see https://github.com/ueberdosis/tiptap/discussions/4008
 */

function getBoundingClientRect(): DOMRect {
  const rect = {
    x: 0,
    y: 0,
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  };
  return { ...rect, toJSON: () => rect };
}

class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number): DOMRect | null {
    return this[index] ?? null;
  }
}

// Mock DOM layout APIs
document.elementFromPoint = (): null => null;
HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
HTMLElement.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();
Range.prototype.getBoundingClientRect = getBoundingClientRect;
Range.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();

// Mock scrollIntoView - not available in jsdom
Element.prototype.scrollIntoView = (): void => {};

// Mock ResizeObserver - needed for some UI components
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock IntersectionObserver - needed for lazy loading
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock matchMedia - needed for responsive components
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  }),
});

// Mock clipboard API - use configurable to allow userEvent to override
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: {
    writeText: async (): Promise<void> => {},
    readText: async (): Promise<string> => "",
    write: async (): Promise<void> => {},
    read: async (): Promise<ClipboardItems> => [],
  },
});
