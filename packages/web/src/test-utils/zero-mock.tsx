import type { ReactNode } from "react";

import { vi } from "vitest";

/**
 * Mock implementation of Zero's useQuery hook for testing.
 *
 * Instead of connecting to a real Zero server, this returns
 * pre-configured mock data.
 *
 * @example
 * ```tsx
 * // In your test file
 * vi.mock('@rocicorp/zero/react', () => ({
 *   useQuery: mockUseQuery({
 *     'documents.byId': { id: 'doc-1', title: 'Test' }
 *   }),
 *   ZeroProvider: ({ children }) => children,
 * }));
 * ```
 */

type QueryData = Record<string, unknown>;

/**
 * Creates a mock useQuery implementation that returns specified data.
 *
 * @param data - Object mapping query names to their return values
 * @returns A mock useQuery function
 */
export function createMockUseQuery(data: QueryData = {}) {
  return function mockUseQuery(query: unknown): [unknown, { isLoading: boolean }] {
    // In a real implementation, we'd parse the query to get the name
    // For testing, we return the first value or null
    const values = Object.values(data);
    return [values.length > 0 ? values[0] : null, { isLoading: false }];
  };
}

/**
 * Creates a mock Zero instance for testing mutations.
 *
 * @returns Mock Zero object with mutate function
 */
export function createMockZero() {
  return {
    mutate: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
  };
}

/**
 * Mock ZeroProvider that doesn't require a real Zero connection.
 */
export function MockZeroProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Helper to mock the useZero hook in tests.
 *
 * @example
 * ```tsx
 * // In your test file
 * vi.mock('@/services/zero', () => ({
 *   useZero: () => createMockZero(),
 * }));
 * ```
 */
export function mockZeroModule() {
  return {
    useZero: () => createMockZero(),
  };
}

/**
 * Helper to create module mocks for Zero.
 *
 * Use this to set up mocks before importing components.
 *
 * @param queryData - Data to return from useQuery calls
 * @returns Object suitable for vi.mock()
 *
 * @example
 * ```tsx
 * vi.mock('@rocicorp/zero/react', () => createZeroMock({
 *   document: { id: 'doc-1', title: 'Test' }
 * }));
 * ```
 */
export function createZeroMock(queryData: QueryData = {}) {
  const mockUseQuery = createMockUseQuery(queryData);

  return {
    useQuery: mockUseQuery,
    ZeroProvider: MockZeroProvider,
  };
}

/**
 * Type-safe mock for specific query results.
 *
 * @example
 * ```tsx
 * const mockDocuments = mockQueryResult([
 *   { id: 'doc-1', title: 'First' },
 *   { id: 'doc-2', title: 'Second' },
 * ]);
 * ```
 */
export function mockQueryResult<T>(data: T): [T, { isLoading: boolean }] {
  return [data, { isLoading: false }];
}

/**
 * Mock loading state for useQuery.
 */
export function mockQueryLoading<T>(): [T | null, { isLoading: boolean }] {
  return [null, { isLoading: true }];
}

/**
 * Mock empty result for useQuery.
 */
export function mockQueryEmpty(): [null, { isLoading: boolean }] {
  return [null, { isLoading: false }];
}
