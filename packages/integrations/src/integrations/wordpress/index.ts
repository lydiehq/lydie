import type { ContentNode } from "@lydie/core/content";
import type {
  DefaultLink,
  DeleteOptions,
  ExternalResource,
  Integration,
  IntegrationConnection,
  PullOptions,
  PushOptions,
  SyncResult,
} from "@lydie/core/integrations/types";

import { createErrorResult } from "@lydie/core/integrations/types";
import { deserializeFromHTML, serializeToHTML } from "@lydie/core/serialization/html";

export interface WordpressConfig {
  siteUrl: string;
  username: string; // WP username
  applicationPassword: string; // Application password
  resourceType?: string;
}

interface WpUser {
  id: number;
  name: string;
  slug: string;
}

// Helper functions

function getAuthHeaders(config: WordpressConfig) {
  const credentials = btoa(`${config.username}:${config.applicationPassword}`);
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

function cleanUrl(url: string): string {
  return url.replace(/\/$/, "");
}

// WordPress sync integration - syncs documents to WordPress sites via REST API
export const wordpressIntegration: Integration = {
  onConnect(): { links?: DefaultLink[] } {
    return {
      links: [
        { name: "Pages", config: { type: "pages" } },
        { name: "Posts", config: { type: "posts" } },
      ],
    };
  },

  async validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean;
    error?: string;
  }> {
    const config = connection.config as WordpressConfig;
    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      return {
        valid: false,
        error: "Missing required configuration: Site URL, Username, or Application Password",
      };
    }

    try {
      const baseUrl = cleanUrl(config.siteUrl);
      console.log("baseUrl", baseUrl);
      console.log("headers", getAuthHeaders(config));
      const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
        headers: getAuthHeaders(config),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            valid: false,
            error: "Invalid credentials. Please check your username and application password.",
          };
        }
        return {
          valid: false,
          error: `Connection failed: ${response.status} ${response.statusText}`,
        };
      }

      const user = (await response.json()) as WpUser;

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: `Connection error: ${error.message}`,
      };
    }
  },

  async fetchResources(connection: IntegrationConnection): Promise<ExternalResource[]> {
    const config = connection.config as WordpressConfig;
    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      return [];
    }

    const resources: ExternalResource[] = [
      {
        id: "pages-container",
        name: "Pages",
        fullName: "WordPress Pages",
        metadata: { type: "pages" },
      },
      {
        id: "posts-container",
        name: "Posts",
        fullName: "WordPress Posts",
        metadata: { type: "posts" },
      },
    ];

    return resources;
  },

  async push(options: PushOptions): Promise<SyncResult> {
    const { document, connection } = options;
    const config = connection.config as WordpressConfig;

    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      return createErrorResult(document.id, "Missing WordPress configuration");
    }

    const htmlContent = serializeToHTML(document.content as ContentNode);
    const title = document.title || "Untitled";
    const slug = document.slug;

    const resourceType = config.resourceType || "pages";
    const endpointType = resourceType === "posts" ? "posts" : "pages";

    const headers = getAuthHeaders(config);
    const baseUrl = cleanUrl(config.siteUrl);

    try {
      let endpoint = "";
      let method = "POST";
      let existingId: number | null = null;

      // Check if it exists by slug
      const searchRes = await fetch(
        `${baseUrl}/wp-json/wp/v2/${endpointType}?slug=${slug}&status=any,publish,draft`,
        { headers },
      );

      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as Array<{
          id: number;
          slug: string;
        }>;
        const existing = searchData.find((item) => item.slug === slug);
        if (existing) {
          existingId = existing.id;
        }
      }

      const payload = {
        title,
        content: htmlContent,
        slug,
        status: "publish",
      };

      if (existingId) {
        endpoint = `${baseUrl}/wp-json/wp/v2/${endpointType}/${existingId}`;
        method = "POST";
      } else {
        endpoint = `${baseUrl}/wp-json/wp/v2/${endpointType}`;
        method = "POST";
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `WordPress API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();
      const finalId = String(data.id);

      return {
        success: true,
        documentId: document.id,
        externalId: finalId,
        message: existingId ? "Updated successfully" : "Published successfully",
        metadata: {
          siteUrl: config.siteUrl,
          slug: data.slug,
          link: data.link,
          type: endpointType,
        },
      };
    } catch (error: any) {
      console.error("WordPress Push Error:", error);
      return createErrorResult(document.id, error.message || "Failed to push to WordPress");
    }
  },

  async delete(options: DeleteOptions): Promise<SyncResult> {
    const { documentId, externalId, connection } = options;
    const config = connection.config as WordpressConfig;

    try {
      if (!config.siteUrl || !config.username || !config.applicationPassword) {
        throw new Error("WordPress configuration incomplete");
      }

      const baseUrl = cleanUrl(config.siteUrl);
      const headers = getAuthHeaders(config);
      const endpointType = config.resourceType || "posts";

      const endpoint = `${baseUrl}/wp-json/wp/v2/${endpointType}/${externalId}?force=true`;

      const response = await fetch(endpoint, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            documentId,
            externalId,
            message: `Resource ${externalId} does not exist, deletion skipped`,
          };
        }
        const errorText = await response.text();
        throw new Error(
          `WordPress API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      return {
        success: true,
        documentId,
        externalId,
        message: `Deleted ${endpointType} ${externalId} from ${config.siteUrl}`,
      };
    } catch (error: any) {
      return createErrorResult(documentId, error.message || "Failed to delete from WordPress");
    }
  },

  async pull(options: PullOptions): Promise<SyncResult[]> {
    const { connection } = options;
    const config = connection.config as WordpressConfig;
    const results: SyncResult[] = [];

    if (!config.siteUrl || !config.username || !config.applicationPassword) {
      return [];
    }

    const headers = getAuthHeaders(config);
    const baseUrl = cleanUrl(config.siteUrl);

    try {
      const processType = async (type: "pages" | "posts") => {
        const res = await fetch(`${baseUrl}/wp-json/wp/v2/${type}?per_page=100`, { headers });
        if (!res.ok) {
          console.error(`Failed to fetch WP ${type}:`, res.statusText);
          return;
        }

        const items = (await res.json()) as Array<{
          id: number;
          title: { rendered: string };
          content: { rendered: string };
          slug: string;
        }>;

        for (const item of items) {
          try {
            const html = item.content.rendered;
            const content = deserializeFromHTML(html);

            results.push({
              success: true,
              documentId: "",
              externalId: String(item.id),
              message: `Pulled ${type.slice(0, -1)}: ${item.title.rendered}`,
              metadata: {
                title: item.title.rendered,
                slug: item.slug,
                content: content,
                wpType: type,
              },
            });
          } catch (err: any) {
            results.push({
              success: false,
              documentId: "",
              externalId: String(item.id),
              error: `Failed to process ${type} ${item.id}: ${err.message}`,
            });
          }
        }
      };

      await processType("pages");
      await processType("posts");

      return results;
    } catch (error: any) {
      console.error("WordPress Pull Error:", error);
      results.push({
        success: false,
        documentId: "",
        error: `Fatal error pulling from WordPress: ${error.message}`,
      });
      return results;
    }
  },
};
