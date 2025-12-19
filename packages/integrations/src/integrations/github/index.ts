import type {
  Integration,
  IntegrationConnection,
  PushOptions,
  PullOptions,
  DeleteOptions,
  SyncResult,
  ExternalResource,
} from "@lydie/core/integrations";
import { createErrorResult } from "@lydie/core/integrations";
import type {
  OAuthConfig,
  OAuthCredentials,
  OAuthIntegration,
} from "@lydie/core/integrations";
import { Resource } from "sst";
import {
  serializeToMarkdown,
  deserializeFromMarkdown,
} from "@lydie/core/serialization/markdown";
import { deserializeFromMDX } from "@lydie/core/serialization/mdx";
import { deserializeFromText } from "@lydie/core/serialization/text";
import jwt from "jsonwebtoken";

// config saved in the database on the connection
type GitHubConfig = {
  // GitHub App fields
  installationId: number; // GitHub App installation ID
  installationAccessToken: string; // Short-lived installation token
  installationTokenExpiresAt: number; // Token expiration timestamp

  // Common fields
  owner?: string;
  repo?: string;
  branch: string;
  basePath?: string;

  // Integration metadata (available to frontend via Zero)
  metadata?: {
    managementUrl?: string; // URL to manage installation in GitHub
    [key: string]: any; // Allow integrations to add custom metadata
  };
};

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
 * Fetch supported files (md, mdx, txt) from GitHub repository
 * Uses the Contents API to get files from a specific folder instead of loading the entire repository
 */
async function fetchSupportedFiles(
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
            const content = Buffer.from(contentData.content, "base64").toString(
              "utf-8"
            );

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
      const subdirectoryFiles = await fetchSupportedFiles(
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

/**
 * Generate the file path for a document in the repository
 * Uses the document title which should include the file extension
 * Supports: .md, .mdx, .txt
 * Includes folder path if provided to maintain folder structure
 */
function getFilePath(
  title: string,
  basePath?: string,
  folderPath?: string | null
): string {
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

  // Build path components
  const pathParts: string[] = [];

  // Add basePath if provided (repository-level base path)
  if (basePath) {
    const normalizedBasePath = basePath.replace(/^\/+|\/+$/g, "");
    if (normalizedBasePath) {
      pathParts.push(normalizedBasePath);
    }
  }

  // Add folderPath if provided (document's folder structure)
  if (folderPath) {
    const normalizedFolderPath = folderPath.replace(/^\/+|\/+$/g, "");
    if (normalizedFolderPath) {
      pathParts.push(normalizedFolderPath);
    }
  }

  // Add filename
  pathParts.push(fileName);

  // Join all parts with slashes
  return pathParts.join("/");
}

/**
 * Get GitHub App-specific credentials
 */
async function getGitHubAppCredentials(): Promise<{
  clientId?: string;
  privateKey?: string;
  appSlug?: string;
}> {
  return {
    clientId: Resource.GitHubClientId.value,
    privateKey: Resource.GitHubPrivateKey.value,
    appSlug: Resource.GitHubAppSlug?.value,
  };
}

/**
 * Generate a JWT for authenticating as the GitHub App
 * This JWT is used to generate installation access tokens
 * Uses Client ID for the iss claim (recommended by GitHub)
 */
async function generateAppJWT(credentials: {
  clientId?: string;
  privateKey?: string;
}): Promise<string> {
  if (!credentials.clientId || !credentials.privateKey) {
    throw new Error("GitHub App credentials not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issue time (60 seconds in the past to allow for clock drift)
    exp: now + 10 * 60, // Expiration time (10 minutes maximum)
    iss: credentials.clientId, // GitHub App's Client ID (recommended over App ID)
  };

  return jwt.sign(payload, credentials.privateKey, { algorithm: "RS256" });
}

/**
 * Generate an installation access token using a JWT
 * This is used for refreshing tokens when they expire
 */
async function generateInstallationTokenWithJWT(
  installationId: number,
  jwtToken: string
): Promise<{ token: string; expires_at: string }> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        permissions: {
          contents: "write",
          metadata: "read",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to generate installation token: ${
        response.statusText
      } - ${JSON.stringify(errorData)}`
    );
  }

  return (await response.json()) as { token: string; expires_at: string };
}

/**
 * Get a fresh access token for the integration
 * Implements automatic token refresh for GitHub Apps
 */
async function getAccessToken(
  connection: IntegrationConnection
): Promise<string> {
  const config = connection.config as GitHubConfig;

  if (!config.installationId || !config.installationAccessToken) {
    throw new Error(
      "GitHub App installation not configured. Please reconnect the GitHub integration."
    );
  }

  const now = Date.now();
  const expiresAt = config.installationTokenExpiresAt;
  const needsRefresh = expiresAt - now < 5 * 60 * 1000; // 5 minutes buffer

  if (needsRefresh) {
    console.log(
      `[GitHub] Refreshing installation token for installation ${config.installationId}`
    );

    // Get credentials to generate a new token
    const credentials = await getGitHubAppCredentials();

    // Generate JWT and use it to get a new installation token
    const jwtToken = await generateAppJWT(credentials);
    const newToken = await generateInstallationTokenWithJWT(
      config.installationId,
      jwtToken
    );

    // Update the config with new token (caller should save to DB)
    config.installationAccessToken = newToken.token;
    config.installationTokenExpiresAt = new Date(newToken.expires_at).getTime();

    console.log(`[GitHub] Token refreshed, expires at ${newToken.expires_at}`);

    return newToken.token;
  }

  return config.installationAccessToken;
}

/**
 * Get GitHub App information including slug
 * Uses JWT to authenticate as the app
 */
async function getAppInfo(): Promise<{ slug: string; name: string }> {
  const credentials = await getGitHubAppCredentials();
  if (!credentials.clientId || !credentials.privateKey) {
    throw new Error("GitHub App credentials not configured");
  }

  const jwtToken = await generateAppJWT(credentials);
  const response = await fetch("https://api.github.com/app", {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch GitHub App info");
  }

  const appInfo = (await response.json()) as { slug: string; name: string };
  return appInfo;
}

// Extended interface for GitHub-specific methods
interface GitHubIntegrationExtended extends Integration, OAuthIntegration {
  getInstallationUrl(state?: string): Promise<string>;
  getAppInfo(): Promise<{ slug: string; name: string }>;
  getAccessToken(connection: IntegrationConnection): Promise<string>;
}

/**
 * GitHub sync integration
 * Syncs documents as Markdown files to a GitHub repository
 */
export const githubIntegration: GitHubIntegrationExtended = {
  async validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean;
    error?: string;
  }> {
    const config = connection.config as GitHubConfig;

    // Basic validation - check for GitHub App installation
    if (!config.installationId || !config.installationAccessToken) {
      return {
        valid: false,
        error: "Missing required configuration: GitHub App installation",
      };
    }

    if (!config.owner || !config.repo || !config.branch) {
      return {
        valid: false,
        error: "Missing required configuration: owner, repo, or branch",
      };
    }

    // TODO: Validate by making a test API call to GitHub
    // For now, just return valid if all fields are present
    return { valid: true };
  },

  async push(options: PushOptions): Promise<SyncResult> {
    const { document, connection, commitMessage } = options;
    const config = connection.config as GitHubConfig;

    try {
      if (!config.repo || !config.owner) {
        throw new Error("Repository not fully configured");
      }

      // Get fresh access token (handles automatic refresh)
      const accessToken = await getAccessToken(connection);

      // Convert TipTap content to Markdown
      const markdown = serializeToMarkdown(document.content);

      // Generate file path using title (which includes extension) and folder path
      // Priority: 1) folderPath from document, 2) extract from externalId, 3) null (root)
      let folderPath = document.folderPath;

      // If folderPath is not provided, try to extract it from externalId
      // This handles cases where the document was synced from GitHub and we want to maintain the same path
      if (!folderPath && document.id) {
        // Note: externalId would need to be passed in the document, but it's not in SyncDocument
        // For now, we'll rely on folderPath being passed from the backend
        // The backend's pushToExtension should provide folderPath based on folderId
      }

      const filePath = getFilePath(document.title, config.basePath, folderPath);

      // Check if file exists to get current SHA (required for updates)
      let currentSha: string | undefined;
      try {
        const getUrl = `https://api.github.com/repos/${config.owner}/${
          config.repo
        }/contents/${filePath}?ref=${config.branch || "main"}`;
        const getResponse = await fetch(getUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
          Authorization: `Bearer ${accessToken}`,
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

      return {
        success: true,
        documentId: document.id,
        externalId: result.content.path,
        message: `Pushed to ${config.owner}/${config.repo}/${result.content.path}`,
      };
    } catch (error) {
      return createErrorResult(
        document.id,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  },

  async delete(options: DeleteOptions): Promise<SyncResult> {
    const { documentId, externalId, connection, commitMessage } = options;
    const config = connection.config as GitHubConfig;

    try {
      if (!config.repo || !config.owner) {
        throw new Error("Repository not fully configured");
      }

      // Get fresh access token (handles automatic refresh)
      const accessToken = await getAccessToken(connection);

      // Get the file's current SHA (required for deletion by GitHub API)
      const getUrl = `https://api.github.com/repos/${config.owner}/${
        config.repo
      }/contents/${externalId}?ref=${config.branch || "main"}`;
      const getResponse = await fetch(getUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!getResponse.ok) {
        if (getResponse.status === 404) {
          // File doesn't exist, consider deletion successful
          return {
            success: true,
            documentId,
            externalId,
            message: `File ${externalId} does not exist, deletion skipped`,
          };
        }
        throw new Error(
          `Failed to get file for deletion: ${getResponse.statusText}`
        );
      }

      const fileData = (await getResponse.json()) as { sha: string };
      const currentSha = fileData.sha;

      // Delete the file
      const deleteUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${externalId}`;
      const deleteBody = {
        message: commitMessage || `Delete ${externalId} from Lydie`,
        sha: currentSha,
        branch: config.branch || "main",
      };

      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deleteBody),
      });

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json().catch(() => ({}));
        throw new Error(
          `Failed to delete file: ${
            deleteResponse.statusText
          } - ${JSON.stringify(errorData)}`
        );
      }

      return {
        success: true,
        documentId,
        externalId,
        message: `Deleted ${externalId} from ${config.owner}/${config.repo}`,
      };
    } catch (error) {
      return createErrorResult(
        documentId,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  },

  async pull(options: PullOptions): Promise<SyncResult[]> {
    const { connection } = options;
    const config = connection.config as GitHubConfig;
    const results: SyncResult[] = [];

    console.log(config);

    try {
      if (!config.repo) {
        throw new Error("Repository not configured");
      }

      // Get fresh access token (handles automatic refresh)
      const accessToken = await getAccessToken(connection);

      // Fetch all supported files (md, mdx, txt) from repository
      const files = await fetchSupportedFiles(
        accessToken,
        config.owner || "",
        config.repo,
        config.branch || "main",
        config.basePath || ""
      );

      for (const file of files) {
        try {
          // Determine deserializer based on file extension
          const extension =
            file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] || "";
          let tipTapContent: any;

          switch (extension) {
            case "mdx":
              tipTapContent = deserializeFromMDX(file.content);
              break;
            case "txt":
              tipTapContent = deserializeFromText(file.content);
              break;
            case "md":
            default:
              tipTapContent = deserializeFromMarkdown(file.content);
          }

          // Extract folder path from file path
          // e.g., "docs/guides/intro.md" -> folderPath: "docs/guides"
          // e.g., "intro.md" -> folderPath: null (root)
          const pathParts = file.path.split("/");
          const fileName = pathParts.pop() || file.name;
          const folderPath =
            pathParts.length > 0
              ? pathParts.join("/").replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
              : null;

          // Generate document ID and slug
          // Slug should not include extension for URL purposes
          const slug = fileName

            .replace(/\.(md|mdx|txt)$/i, "")
            .replace(/\//g, "-")
            .toLowerCase();

          // Preserve the full
          // This is crucial for GitHub integration to know what extension to use when pushing
          const title = fileName;

          results.push({
            success: true,
            documentId: "", // Will be created by backend
            externalId: file.path,
            message: `Pulled ${file.path}`,
            metadata: {
              title,
              slug,
              content: tipTapContent,
              folderPath, // Include folder path for folder creation
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
  },

  /**
   * Fetch available resources (repositories)
   * For GitHub Apps, we use the installation token to access repositories
   * We fetch repositories from the installation's account (owner)
   */
  async fetchResources(
    connection: IntegrationConnection
  ): Promise<ExternalResource[]> {
    const config = connection.config as GitHubConfig;

    if (!config.installationId) {
      throw new Error("GitHub App installation ID not found");
    }

    // Get fresh installation access token
    const accessToken = await getAccessToken(connection);

    // Get GitHub App credentials to generate JWT for fetching installation details
    const appCredentials = await getGitHubAppCredentials();
    const jwtToken = await generateAppJWT(appCredentials);

    // Get installation details to determine account type and login
    const installationResponse = await fetch(
      `https://api.github.com/app/installations/${config.installationId}`,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!installationResponse.ok) {
      const errorData = await installationResponse.json().catch(() => ({}));
      throw new Error(
        `Failed to fetch installation: ${
          installationResponse.statusText
        } - ${JSON.stringify(errorData)}`
      );
    }

    const installation = (await installationResponse.json()) as {
      account: { login: string; type: string };
    };

    const accountLogin = installation.account.login;
    const accountType = installation.account.type; // "User" or "Organization"

    // Use the appropriate endpoint based on account type
    // Installation tokens can access repositories that the installation has access to
    const endpoint =
      accountType === "Organization"
        ? `https://api.github.com/orgs/${accountLogin}/repos`
        : `https://api.github.com/users/${accountLogin}/repos`;

    const response = await fetch(
      `${endpoint}?sort=updated&per_page=100&type=all`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        "Failed to fetch repositories:",
        response.status,
        errorData
      );
      throw new Error(
        `Failed to fetch repositories: ${
          response.statusText
        } - ${JSON.stringify(errorData)}`
      );
    }

    const repositories = (await response.json()) as Array<{
      name: string;
      full_name: string;
      default_branch: string;
    }>;

    return repositories.map((repo) => ({
      id: repo.full_name,
      name: repo.name,
      fullName: repo.full_name,
      metadata: {
        defaultBranch: repo.default_branch,
      },
    }));
  },

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
  },

  async getOAuthCredentials(): Promise<OAuthCredentials> {
    return {
      clientId: Resource.GitHubClientId.value,
      clientSecret: Resource.GitHubClientSecret.value,
    };
  },

  buildAuthorizationUrl(
    credentials: OAuthCredentials,
    state: string,
    redirectUri: string,
    params?: Record<string, string>
  ): string {
    const appSlug = Resource.GitHubAppSlug.value;
    if (!appSlug) {
      throw new Error("GitHub App slug not configured");
    }

    const urlParams = new URLSearchParams({
      state,
      redirect_uri: redirectUri,
    });
    return `https://github.com/apps/${appSlug}/installations/new?${urlParams.toString()}`;
  },

  /**
   * Handle OAuth callback for GitHub App installation flow
   */
  async handleOAuthCallback(
    queryParams: Record<string, string>
  ): Promise<GitHubConfig> {
    const { installation_id } = queryParams;

    if (!installation_id) {
      throw new Error(
        "Missing installation_id parameter - GitHub App installation required"
      );
    }

    console.log(
      `[GitHub] Processing GitHub App installation: ${installation_id}`
    );

    const installationId = Number(installation_id);

    // Get GitHub App credentials
    const appCredentials = await getGitHubAppCredentials();

    // Generate JWT for GitHub App authentication
    const jwtToken = await generateAppJWT(appCredentials);

    // Generate installation access token
    const installationToken = await generateInstallationTokenWithJWT(
      installationId,
      jwtToken
    );

    // Fetch installation details to get account info
    const installationResponse = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!installationResponse.ok) {
      throw new Error("Failed to fetch installation details");
    }

    const installation = (await installationResponse.json()) as {
      account: { login: string };
    };

    return {
      installationId,
      installationAccessToken: installationToken.token,
      installationTokenExpiresAt: new Date(
        installationToken.expires_at
      ).getTime(),
      owner: installation.account.login,
      branch: "main",
      // User will need to select repo in a second step
      metadata: {
        managementUrl: `https://github.com/settings/installations/${installationId}`,
      },
    };
  },

  /**
   * Get the installation URL for the GitHub App
   */
  async getInstallationUrl(state?: string): Promise<string> {
    const appInfo = await getAppInfo();
    const baseUrl = `https://github.com/apps/${appInfo.slug}/installations/new`;
    if (state) {
      return `${baseUrl}?state=${encodeURIComponent(state)}`;
    }
    return baseUrl;
  },

  /**
   * Get GitHub App information including slug
   * Uses JWT to authenticate as the app
   */
  async getAppInfo(): Promise<{ slug: string; name: string }> {
    return getAppInfo();
  },

  /**
   * Get a fresh access token for the integration
   * Implements automatic token refresh for GitHub Apps
   */
  async getAccessToken(connection: IntegrationConnection): Promise<string> {
    return getAccessToken(connection);
  },

  /**
   * Remove the GitHub App installation when connection is disconnected
   */
  async onDisconnect(connection: IntegrationConnection): Promise<void> {
    const config = connection.config as GitHubConfig;

    if (!config.installationId) {
      console.log(
        "[GitHub] No installation ID found, skipping installation removal"
      );
      return;
    }

    try {
      // Get GitHub App credentials to generate JWT
      const appCredentials = await getGitHubAppCredentials();
      if (!appCredentials.clientId || !appCredentials.privateKey) {
        console.error(
          "[GitHub] App credentials not configured, cannot remove installation"
        );
        return;
      }

      // Generate JWT for GitHub App authentication
      const jwtToken = await generateAppJWT(appCredentials);

      // Delete the installation using GitHub API
      const deleteResponse = await fetch(
        `https://api.github.com/app/installations/${config.installationId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!deleteResponse.ok) {
        // 404 means installation already deleted, which is fine
        if (deleteResponse.status === 404) {
          console.log(
            `[GitHub] Installation ${config.installationId} already removed`
          );
          return;
        }

        const errorData = await deleteResponse.json().catch(() => ({}));
        throw new Error(
          `Failed to delete installation: ${
            deleteResponse.statusText
          } - ${JSON.stringify(errorData)}`
        );
      }

      console.log(
        `[GitHub] Successfully removed installation ${config.installationId}`
      );
    } catch (error) {
      // Log error but don't throw - we don't want to block disconnection
      // if the installation removal fails (e.g., already deleted, network issue)
      console.error(
        `[GitHub] Error removing installation ${config.installationId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  },
};
