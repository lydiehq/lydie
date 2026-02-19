/**
 * Test utilities for Vitest testing.
 *
 * This module provides helpers for testing React components,
 * TipTap editors, and Zero data fetching.
 *
 * @example
 * ```tsx
 * import {
 *   renderWithProviders,
 *   createTestEditor,
 *   createMockDocument,
 *   screen,
 *   userEvent,
 * } from '@/test-utils';
 *
 * describe('MyComponent', () => {
 *   it('renders correctly', () => {
 *     const editor = createTestEditor('<p>Hello</p>');
 *     renderWithProviders(<MyComponent editor={editor} />);
 *     expect(screen.getByText('Hello')).toBeInTheDocument();
 *   });
 * });
 * ```
 */

// Editor testing utilities
export {
  createTestEditor,
  createEditorWithLink,
  createEditorWithInternalLink,
  setEditorSelection,
  focusEditor,
  createLink,
  createInternalLink,
  getEditorHTML,
  getEditorText,
  isMarkActive,
  getMarkAttributes,
  destroyEditor,
} from "./editor";

// Test data factories
export {
  createMockOrganization,
  createMockDocument,
  createMockUser,
  createMockSearchResults,
  createMockInternalDocument,
  createMockAuthContext,
  createMockNavigate,
  createMockFilter,
  createMockCollection,
  createMockCollectionFields,
  type MockOrganization,
  type MockDocument,
  type MockUser,
  type MockAuthContext,
  type MockCollection,
  type MockCollectionFields,
} from "./factories";

// Custom render and testing utilities
export {
  renderWithProviders,
  useTestOrganization,
  screen,
  waitFor,
  within,
  fireEvent,
  userEvent,
  type TestRenderOptions,
} from "./render";

// Zero mocking utilities
export {
  createMockUseQuery,
  createMockZero,
  MockZeroProvider,
  mockZeroModule,
  createZeroMock,
  mockQueryResult,
  mockQueryLoading,
  mockQueryEmpty,
} from "./zero-mock";
