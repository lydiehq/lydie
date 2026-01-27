import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { I18nProvider } from "react-aria-components";

import type { MockOrganization } from "./factories";

import { createMockOrganization } from "./factories";

/**
 * Organization context for tests.
 */
const OrganizationContext = {
  current: null as MockOrganization | null,
};

/**
 * Hook that provides the mock organization in tests.
 * This mirrors the real useOrganization hook interface.
 */
export function useTestOrganization() {
  if (!OrganizationContext.current) {
    throw new Error(
      "useTestOrganization called outside of TestOrganizationProvider",
    );
  }
  return { organization: OrganizationContext.current };
}

/**
 * Test wrapper provider that sets up organization context.
 */
function TestOrganizationProvider({
  organization,
  children,
}: {
  organization: MockOrganization;
  children: ReactNode;
}) {
  OrganizationContext.current = organization;
  return <>{children}</>;
}

/**
 * Options for renderWithProviders.
 */
export interface TestRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /**
   * Mock organization data.
   */
  organization?: Partial<MockOrganization>;

  /**
   * Initial route path (for components that use routing).
   */
  initialPath?: string;
}

/**
 * Custom render function that wraps the component with necessary providers.
 *
 * This provides:
 * - React Query client (with retry disabled for tests)
 * - I18n provider (for react-aria-components)
 * - Mock organization context
 *
 * @param ui - The component to render
 * @param options - Render options including mock data
 * @returns Render result with additional utilities
 *
 * @example
 * ```tsx
 * const { getByText } = renderWithProviders(
 *   <MyComponent />,
 *   { organization: { name: 'Test Org' } }
 * );
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options: TestRenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const { organization: organizationOverrides, ...renderOptions } = options;

  const organization = createMockOrganization(organizationOverrides);

  // Create a new QueryClient for each test to avoid state leakage
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  function AllProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale="en-US">
          <TestOrganizationProvider organization={organization}>
            {children}
          </TestOrganizationProvider>
        </I18nProvider>
      </QueryClientProvider>
    );
  }

  const result = render(ui, {
    wrapper: AllProviders,
    ...renderOptions,
  });

  return {
    ...result,
    queryClient,
  };
}

/**
 * Re-export testing library utilities for convenience.
 */
export { screen, waitFor, within, fireEvent } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
