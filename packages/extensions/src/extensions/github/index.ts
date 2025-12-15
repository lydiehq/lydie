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
import {
  serializeToMarkdown,
  deserializeFromFile,
} from "@lydie/core/serialization";

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
    const { document, connection, commitMessage } = options;
    const config = connection.config as GitHubConfig;

    try {
      if (!config.repo || !config.accessToken || !config.owner) {
        throw new Error("Repository not fully configured");
      }

      // Convert TipTap content to Markdown
      const markdown = await this.convertToExternalFormat(document.content);

      // Generate file path using title (which includes extension)
      const filePath = this.getFilePath(document.title, config.basePath);

      // Check if file exists to get current SHA (required for updates)
      let currentSha: string | undefined;
      try {
        const getUrl = `https://api.github.com/repos/${config.owner}/${
          config.repo
        }/contents/${filePath}?ref=${config.branch || "main"}`;
        const getResponse = await fetch(getUrl, {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (getResponse.ok) {
          const fileData = (await getResponse.json()) as { sha: string };
          currentSha = fileData.sha;
        } else if (getResponse.status !== 404) {
          // 404 is expected for new files, but other errors should be thrown
          throw new Error(
            `Failed to check file existence: ${getResponse.statusText}`
          );
        }
      } catch (error) {
        // If it's not a 404, rethrow
        if (error instanceof Error && !error.message.includes("404")) {
          throw error;
        }
      }

      // Encode content as base64 (GitHub API requirement)
      const contentBase64 = Buffer.from(markdown, "utf-8").toString("base64");

      // Create or update file
      const putUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
      const putBody: {
        message: string;
        content: string;
        branch: string;
        sha?: string;
      } = {
        message: commitMessage || `Update ${filePath} from Lydie`,
        content: contentBase64,
        branch: config.branch || "main",
      };

      // Include SHA for updates (required by GitHub API)
      if (currentSha) {
        putBody.sha = currentSha;
      }

      const putResponse = await fetch(putUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(putBody),
      });

      if (!putResponse.ok) {
        const errorData = await putResponse.json().catch(() => ({}));
        throw new Error(
          `Failed to push file: ${putResponse.statusText} - ${JSON.stringify(
            errorData
          )}`
        );
      }

      const result = (await putResponse.json()) as {
        content: { path: string };
      };
      return this.createSuccessResult(
        document.id,
        result.content.path,
        `Pushed to ${config.owner}/${config.repo}/${result.content.path}`
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

      // Fetch all supported files (md, mdx, txt) from repository
      const files = await this.fetchSupportedFiles(
        config.accessToken,
        config.owner || "",
        config.repo,
        config.branch || "main",
        config.basePath || ""
      );

      for (const file of files) {
        try {
          // Convert file content to TipTap JSON based on file extension
          const tipTapContent = await this.convertFromExternalFormat(
            file.content,
            file.name
          );

          // Generate document ID and slug
          // Slug should not include extension for URL purposes
          const slug = file.path
            .replace(/\.(md|mdx|txt)$/i, "")
            .replace(/\//g, "-")
            .toLowerCase();

          // Preserve the full filename with extension in the title
          // This is crucial for GitHub extension to know what extension to use when pushing
          const title = file.name;

          results.push({
            success: true,
            documentId: "", // Will be created by backend
            externalId: file.path,
            message: `Pulled ${file.path}`,
            metadata: {
              title,
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

  async convertFromExternalFormat(
    content: string,
    filename?: string
  ): Promise<any> {
    // Use unified deserializer that routes to the correct deserializer based on file extension
    // If filename is not provided, default to markdown deserialization
    if (!filename) {
      // Fallback to markdown deserializer if filename is not available
      const { deserializeFromMarkdown } = await import(
        "@lydie/core/serialization"
      );
      return deserializeFromMarkdown(content);
    }
    return deserializeFromFile(content, filename);
  }

  /**
   * Fetch supported files (md, mdx, txt) from GitHub repository
   * Uses the Contents API to get files from a specific folder instead of loading the entire repository
   */
  private async fetchSupportedFiles(
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
        // Check if it's a supported file type (md, mdx, txt)
        if (/\.(md|mdx|txt)$/i.test(item.name)) {
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
        // Recursively fetch supported files from subdirectories
        const subdirectoryFiles = await this.fetchSupportedFiles(
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
    return serializeToMarkdown(content);
  }

  /**
   * Generate the file path for a document in the repository
   * Uses the document title which should include the file extension
   * Supports: .md, .mdx, .txt
   */
  private getFilePath(title: string, basePath?: string): string {
    // Title should already include the extension (e.g., "file.md", "file.mdx", or "file.txt")
    // If it doesn't, default to .md
    let fileName = title.includes(".") ? title : `${title}.md`;

    // Validate that the extension is supported
    const extension = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1];
    if (extension && !["md", "mdx", "txt"].includes(extension)) {
      // If extension is not supported, default to .md
      const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
      fileName = `${nameWithoutExt}.md`;
    }

    if (!basePath) {
      return fileName;
    }

    // Remove leading and trailing slashes from basePath
    const normalizedBasePath = basePath.replace(/^\/+|\/+$/g, "");

    // Combine basePath and fileName, ensuring no leading slash
    return normalizedBasePath ? `${normalizedBasePath}/${fileName}` : fileName;
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
