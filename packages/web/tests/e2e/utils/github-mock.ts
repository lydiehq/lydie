import type { Route } from "@playwright/test";

/**
 * Mock responses for GitHub API endpoints
 * Use these to test the integration functionality without hitting real GitHub APIs
 */

export interface MockRepository {
  name: string;
  full_name: string;
  default_branch: string;
}

export interface MockFile {
  type: "file" | "dir";
  path: string;
  name: string;
  content?: string; // base64 encoded for files
}

/**
 * Mock GitHub user info endpoint
 */
export async function mockGitHubUserEndpoint(
  route: Route,
  user: { login: string; id: number; avatar_url?: string }
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(user),
  });
}

/**
 * Mock GitHub repositories list endpoint
 */
export async function mockGitHubRepositoriesEndpoint(
  route: Route,
  repositories: MockRepository[]
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(repositories),
  });
}

/**
 * Mock GitHub contents endpoint (for fetching directory/file contents)
 */
export async function mockGitHubContentsEndpoint(
  route: Route,
  contents: MockFile[]
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(contents),
  });
}

/**
 * Mock GitHub file content endpoint
 */
export async function mockGitHubFileEndpoint(
  route: Route,
  content: string,
  sha?: string
) {
  // GitHub returns content as base64
  const base64Content = Buffer.from(content).toString("base64");

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      content: base64Content,
      sha: sha || "mock-sha-12345",
      encoding: "base64",
    }),
  });
}

/**
 * Mock GitHub file update/create endpoint (PUT)
 */
export async function mockGitHubFilePutEndpoint(
  route: Route,
  path: string,
  sha: string = "new-sha-67890"
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      content: {
        path,
        sha,
      },
      commit: {
        sha: "commit-sha-12345",
        message: `Update ${path}`,
      },
    }),
  });
}

/**
 * Setup common GitHub API mocks for testing
 */
export function setupGitHubApiMocks(page: any) {
  // Mock user endpoint
  page.route("https://api.github.com/user", async (route: Route) => {
    await mockGitHubUserEndpoint(route, {
      login: "test-user",
      id: 12345,
      avatar_url: "https://github.com/test-user.png",
    });
  });

  // Mock repositories endpoint
  page.route("https://api.github.com/user/repos*", async (route: Route) => {
    await mockGitHubRepositoriesEndpoint(route, [
      {
        name: "test-repo",
        full_name: "test-user/test-repo",
        default_branch: "main",
      },
      {
        name: "docs",
        full_name: "test-user/docs",
        default_branch: "master",
      },
    ]);
  });

  // Mock contents endpoint (directory listing)
  page.route(
    "https://api.github.com/repos/*/contents/*",
    async (route: Route) => {
      const url = new URL(route.request().url());
      const pathSegments = url.pathname.split("/");
      const path = pathSegments.slice(5).join("/"); // Extract path after /repos/owner/repo/contents/

      if (route.request().method() === "GET") {
        // Return mock directory contents
        await mockGitHubContentsEndpoint(route, [
          {
            type: "file",
            path: `${path}/README.md`,
            name: "README.md",
          },
          {
            type: "file",
            path: `${path}/guide.mdx`,
            name: "guide.mdx",
          },
          {
            type: "dir",
            path: `${path}/api`,
            name: "api",
          },
        ]);
      } else if (route.request().method() === "PUT") {
        // Handle file create/update
        await mockGitHubFilePutEndpoint(route, path);
      }
    }
  );

  return page;
}

/**
 * Create mock markdown files for testing document sync
 */
export function createMockMarkdownFiles(): MockFile[] {
  return [
    {
      type: "file",
      path: "docs/README.md",
      name: "README.md",
      content: Buffer.from("# Test Documentation\n\nThis is a test.").toString(
        "base64"
      ),
    },
    {
      type: "file",
      path: "docs/getting-started.md",
      name: "getting-started.md",
      content: Buffer.from(
        "# Getting Started\n\n## Installation\n\nRun `npm install`"
      ).toString("base64"),
    },
    {
      type: "file",
      path: "docs/api/reference.mdx",
      name: "reference.mdx",
      content: Buffer.from(
        "# API Reference\n\nimport { Callout } from 'components'\n\n<Callout>Test</Callout>"
      ).toString("base64"),
    },
  ];
}
