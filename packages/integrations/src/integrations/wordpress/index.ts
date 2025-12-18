import type {
  Integration,
  IntegrationConnection,
  PushOptions,
  PullOptions,
  SyncResult,
  ExternalResource,
  DefaultLink,
} from "../../types";
import { createErrorResult } from "../../types";
import {
  serializeToHTML,
  deserializeFromHTML,
} from "@lydie/core/serialization/html";
import type { ContentNode } from "@lydie/core/content";

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

// Helper functions (module-level, not exported)

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

/**
 * WordPress sync integration
 * Syncs documents to WordPress sites via REST API
 */
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
        error:
          "Missing required configuration: Site URL, Username, or Application Password",
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
            error:
              "Invalid credentials. Please check your username and application password.",
          };
        }
        return {
          valid: false,
          error: `Connection failed: ${response.status} ${response.statusText}`,
        };
      }

      const user = (await response.json()) as WpUser;
      // Optional: Check if we are actually the user we expect?? Not strictly necessary.

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: `Connection error: ${error.message}`,
      };
    }
  },

  async fetchResources(
    connection: IntegrationConnection
  ): Promise<ExternalResource[]> {
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
    const slug = document.slug; // WP uses 'slug' field

    // resourceType is usually selected by the user when choosing a folder to sync to
    // If not set, default to "pages" or whatever logic applies
    const resourceType = config.resourceType || "pages";
    // Note: WP API endpoints are /pages and /posts
    const endpointType = resourceType === "posts" ? "posts" : "pages";

    const headers = getAuthHeaders(config);
    const baseUrl = cleanUrl(config.siteUrl);

    try {
      let endpoint = "";
      let method = "POST";
      let existingId: number | null = null;

      // 1. Check if it exists by slug
      const searchRes = await fetch(
        `${baseUrl}/wp-json/wp/v2/${endpointType}?slug=${slug}&status=any,publish,draft`,
        { headers }
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
        status: "publish", // Explicitly publish, or user preference? Default to publish for now.
      };

      if (existingId) {
        endpoint = `${baseUrl}/wp-json/wp/v2/${endpointType}/${existingId}`;
        method = "POST"; // WP REST API allows POST for updates too, or PUT.
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
          `WordPress API error: ${response.status} ${response.statusText} - ${errorText}`
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
      return createErrorResult(
        document.id,
        error.message || "Failed to push to WordPress"
      );
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
      // Function to fetch and process a specific type (pages or posts)
      const processType = async (type: "pages" | "posts") => {
        // Fetch latest 100?
        const res = await fetch(
          `${baseUrl}/wp-json/wp/v2/${type}?per_page=100`,
          { headers }
        );
        if (!res.ok) {
          console.error(`Failed to fetch WP ${type}:`, res.statusText);
          return;
        }

        const items = (await res.json()) as Array<{
          id: number;
          title: { rendered: string };
          content: { rendered: string }; // This is HTML
          slug: string;
        }>;

        for (const item of items) {
          try {
            const html = item.content.rendered;
            // deserializeFromHTML expects full HTML.
            const content = deserializeFromHTML(html);

            results.push({
              success: true,
              documentId: "", // Backend handles
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
