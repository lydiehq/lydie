import { BaseSyncExtension } from "../../extension";
import type {
  ExtensionConnection,
  PushOptions,
  PullOptions,
  SyncResult,
} from "../../types";
import type {
  OAuthConfig,
  OAuthCredentials,
  OAuthTokenResponse,
} from "../../oauth";
import { Resource } from "sst";

/**
 * GitHub extension configuration stored in the database
 */
export interface GitHubConfig {
  accessToken: string;
  installationId?: string; // GitHub App installation ID
  owner?: string;
  repo?: string;
  branch: string;
  basePath?: string;
}

/**
 * GitHub App installation info
 */
export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    type: string;
  };
  repository_selection: "all" | "selected";
  repositories?: Array<{
    name: string;
    full_name: string;
  }>;
}

/**
 * GitHub sync extension
 * Syncs documents as Markdown files to a GitHub repository
 */
export class GitHubExtension extends BaseSyncExtension {
  readonly type = "github";
  readonly name = "GitHub";
  readonly description =
    "Sync documents as Markdown files to a GitHub repository";

  async validateConnection(connection: ExtensionConnection): Promise<{
    valid: boolean;
    error?: string;
  }> {
    const config = connection.config as GitHubConfig;

    // Basic validation
    if (
      !config.accessToken ||
      !config.owner ||
      !config.repo ||
      !config.branch
    ) {
      return {
        valid: false,
        error:
          "Missing required configuration: accessToken, owner, repo, or branch",
      };
    }

    // TODO: Validate by making a test API call to GitHub
    // For now, just return valid if all fields are present
    return { valid: true };
  }

  async push(options: PushOptions): Promise<SyncResult> {
    const { document, connection } = options;
    const config = connection.config as GitHubConfig;

    try {
      // Convert TipTap content to Markdown
      const markdown = await this.convertToExternalFormat(document.content);

      // TODO: Implement actual GitHub API calls
      // 1. Check if file exists (GET /repos/:owner/:repo/contents/:path)
      // 2. Create/update file (PUT /repos/:owner/:repo/contents/:path)
      // 3. Handle conflicts if file was modified externally

      const filePath = this.getFilePath(document.slug, config.basePath);

      return this.createSuccessResult(
        document.id,
        filePath,
        `Would push to ${config.owner}/${config.repo}/${filePath}`
      );
    } catch (error) {
      return this.createErrorResult(
        document.id,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  async pull(options: PullOptions): Promise<SyncResult[]> {
    const { connection } = options;
    const config = connection.config as GitHubConfig;
    const results: SyncResult[] = [];

    console.log(config);

    try {
      if (!config.repo || !config.accessToken) {
        throw new Error("Repository not configured");
      }

      // Fetch all markdown/mdx files from repository
      const files = await this.fetchMarkdownFiles(
        config.accessToken,
        config.owner || "",
        config.repo,
        config.branch || "main",
        config.basePath || ""
      );

      for (const file of files) {
        try {
          // Convert markdown to TipTap JSON
          const tipTapContent = await this.convertFromExternalFormat(
            file.content
          );

          // Generate document ID and slug
          const slug = file.path
            .replace(/\.(md|mdx)$/, "")
            .replace(/\//g, "-")
            .toLowerCase();

          results.push({
            success: true,
            documentId: "", // Will be created by backend
            externalId: file.path,
            message: `Pulled ${file.path}`,
            metadata: {
              title: file.name.replace(/\.(md|mdx)$/, ""),
              slug,
              content: tipTapContent,
            },
          });
        } catch (error) {
          results.push({
            success: false,
            documentId: "",
            externalId: file.path,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return results;
    } catch (error) {
      return [
        {
          success: false,
          documentId: "",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      ];
    }
  }

  async convertFromExternalFormat(markdown: string): Promise<any> {
    // TODO: Implement proper Markdown to TipTap conversion
    // For now, return a basic structure
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: markdown,
            },
          ],
        },
      ],
    };
  }

  /**
   * Fetch markdown files from GitHub repository
   * Uses the Contents API to get files from a specific folder instead of loading the entire repository
   */
  private async fetchMarkdownFiles(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
    basePath: string
  ): Promise<Array<{ path: string; name: string; content: string }>> {
    const files: Array<{ path: string; name: string; content: string }> = [];

    // Use Contents API to get directory contents
    // If basePath is empty, we'll get the root directory
    const path = basePath || "";
    const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

    const contentsResponse = await fetch(contentsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!contentsResponse.ok) {
      throw new Error(
        `Failed to fetch repository contents: ${contentsResponse.statusText}`
      );
    }

    const contents = (await contentsResponse.json()) as Array<{
      type: string;
      path: string;
      name: string;
    }>;

    console.log("GitHub contents:", contents);

    // Recursively process directory contents
    for (const item of contents) {
      if (item.type === "file") {
        // Check if it's a markdown file
        if (/\.(md|mdx)$/i.test(item.name)) {
          try {
            const contentResponse = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${branch}`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: "application/vnd.github+json",
                },
              }
            );

            if (contentResponse.ok) {
              const contentData = (await contentResponse.json()) as {
                content: string;
              };
              // GitHub returns content as base64
              const content = Buffer.from(
                contentData.content,
                "base64"
              ).toString("utf-8");

              files.push({
                path: item.path,
                name: item.name,
                content,
              });
            }
          } catch (error) {
            console.error(`Failed to fetch ${item.path}:`, error);
          }
        }
      } else if (item.type === "dir") {
        // Recursively fetch markdown files from subdirectories
        const subdirectoryFiles = await this.fetchMarkdownFiles(
          accessToken,
          owner,
          repo,
          branch,
          item.path
        );
        files.push(...subdirectoryFiles);
      }
    }

    return files;
  }

  async convertToExternalFormat(content: any): Promise<string> {
    // TODO: Implement TipTap to Markdown conversion
    // This is a placeholder - you'll want to use a proper converter
    return "# Placeholder Markdown\n\nTODO: Implement TipTap to Markdown conversion";
  }

  /**
   * Generate the file path for a document in the repository
   */
  private getFilePath(slug: string, basePath?: string): string {
    const fileName = `${slug}.md`;
    return basePath ? `${basePath}/${fileName}` : fileName;
  }

  // OAuth Implementation

  getOAuthConfig(): OAuthConfig {
    return {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo"], // Full repository access
      authParams: {
        // Request user info as well
        allow_signup: "false",
      },
    };
  }

  async getOAuthCredentials(): Promise<OAuthCredentials> {
    // Get from SST/Resource in backend, or environment variables in development
    const clientId = Resource.GitHubClientId.value;
    const clientSecret = Resource.GitHubClientSecret.value;

    console.log("Using GitHub client ID:", clientId);
    console.log("Using GitHub client secret:", clientSecret);

    return {
      clientId: Resource.GitHubClientId.value,
      clientSecret: Resource.GitHubClientSecret.value,
    };
  }

  buildAuthorizationUrl(
    credentials: OAuthCredentials,
    state: string,
    redirectUri: string
  ): string {
    const config = this.getOAuthConfig();
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(" "),
      state,
      ...config.authParams,
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
    credentials: OAuthCredentials,
    redirectUri: string
  ): Promise<OAuthTokenResponse> {
    const config = this.getOAuthConfig();

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange code: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async transformOAuthResponse(
    tokenResponse: OAuthTokenResponse
  ): Promise<GitHubConfig> {
    // Fetch user info to get default repository information
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenResponse.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch GitHub user info");
    }

    const user = (await userResponse.json()) as { login: string };

    return {
      accessToken: tokenResponse.accessToken,
      branch: "main",
      owner: user.login, // Default to user's account
      // User will need to select repo in a second step
    };
  }

  /**
   * Fetch available repositories for the authenticated user
   */
  async fetchRepositories(
    accessToken: string
  ): Promise<
    Array<{ name: string; full_name: string; default_branch: string }>
  > {
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch repositories");
    }

    return (await response.json()) as Array<{
      name: string;
      full_name: string;
      default_branch: string;
    }>;
  }
}
