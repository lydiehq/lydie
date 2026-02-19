import { vi } from "vitest";

/**
 * Test data factories for creating mock objects.
 *
 * These factories provide consistent test data with sensible defaults
 * that can be overridden as needed.
 */

/**
 * Creates a mock organization for testing.
 */
export function createMockOrganization(
  overrides: Partial<MockOrganization> = {},
): MockOrganization {
  return {
    id: "org-test-123",
    name: "Test Organization",
    slug: "test-org",
    logo: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Creates a mock document for testing.
 */
export function createMockDocument(overrides: Partial<MockDocument> = {}): MockDocument {
  const id = overrides.id ?? `doc-${Math.random().toString(36).slice(2, 11)}`;
  return {
    id,
    title: "Test Document",
    organization_id: "org-test-123",
    parent_id: null,
    content: null,
    yjs_state: null,
    cover_image: null,
    is_locked: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    sort_order: 0,
    custom_fields: {},
    collection_id: null,
    ...overrides,
  };
}

export interface MockDocument {
  id: string;
  title: string | null;
  organization_id: string;
  parent_id: string | null;
  content: string | null;
  yjs_state: string | null;
  cover_image: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sort_order: number;
  custom_fields: Record<string, string | number>;
  collection_id: string | null;
}

/**
 * Creates a mock user for testing.
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: "user-test-123",
    email: "test@example.com",
    name: "Test User",
    image: null,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export interface MockUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a list of mock documents for search results.
 */
export function createMockSearchResults(
  count = 3,
  overrides: Partial<MockDocument> = {},
): MockDocument[] {
  return Array.from({ length: count }, (_, i) =>
    createMockDocument({
      id: `doc-${i + 1}`,
      title: `Document ${i + 1}`,
      ...overrides,
    }),
  );
}

/**
 * Creates mock internal document data (for link popover).
 */
export function createMockInternalDocument(title = "Linked Document"): { title: string | null } {
  return { title };
}

/**
 * Creates a mock auth context for testing.
 */
export function createMockAuthContext(overrides: Partial<MockAuthContext> = {}): MockAuthContext {
  return {
    user: createMockUser(),
    session: {
      id: "session-123",
      token: "mock-token",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    ...overrides,
  };
}

export interface MockAuthContext {
  user: MockUser;
  session: {
    id: string;
    token: string;
    expiresAt: Date;
  };
}

/**
 * Creates mock navigation function for testing.
 */
export function createMockNavigate() {
  return vi.fn();
}

/**
 * Creates a mock filter function for react-aria-components.
 */
export function createMockFilter() {
  return {
    contains: (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()),
    startsWith: (a: string, b: string) => a.toLowerCase().startsWith(b.toLowerCase()),
  };
}
