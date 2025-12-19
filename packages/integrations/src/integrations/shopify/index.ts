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
  serializeToHTML,
  deserializeFromHTML,
} from "@lydie/core/serialization/html";
import { deserializeFromText } from "@lydie/core/serialization/text";
import type { ContentNode } from "@lydie/core/content";

export interface ShopifyConfig {
  shop: string; // myshop.myshopify.com
  accessToken: string;
  scopes: string[];
  resourceType?: string; // "pages" or "blog"
  resourceId?: string; // "pages-container" or blog ID
}

interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
}

/**
 * Shopify sync integration
 * Syncs documents to Shopify via REST Admin API
 */
export const shopifyIntegration: Integration & OAuthIntegration = {
  async validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean;
    error?: string;
  }> {
    const config = connection.config as ShopifyConfig;
    if (!config.shop || !config.accessToken) {
      return {
        valid: false,
        error: "Missing required configuration: shop or accessToken",
      };
    }

    // Validate by making a lightweight API call
    try {
      const response = await fetch(
        `https://${config.shop}/admin/api/2024-01/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": config.accessToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        // Check for 401 Unauthorized specifically
        if (response.status === 401) {
          return {
            valid: false,
            error: "Invalid access token or shop URL",
          };
        }
        return {
          valid: false,
          error: `Failed to validate connection: ${response.statusText}`,
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: `Connection validation error: ${error.message}`,
      };
    }
  },

  async fetchResources(
    connection: IntegrationConnection
  ): Promise<ExternalResource[]> {
    const config = connection.config as ShopifyConfig;
    if (!config.shop || !config.accessToken) {
      return [];
    }

    const headers = {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    };

    try {
      // 1. Always include the "Pages" container
      const resources: ExternalResource[] = [
        {
          id: "pages-container",
          name: "Shopify Pages",
          fullName: "Shopify Pages",
          metadata: { type: "pages" },
        },
      ];

      // 2. Fetch Blogs
      const blogsRes = await fetch(
        `https://${config.shop}/admin/api/2024-01/blogs.json`,
        { headers }
      );

      if (blogsRes.ok) {
        const blogsData = (await blogsRes.json()) as {
          blogs: Array<{ id: number; title: string }>;
        };
        resources.push(
          ...blogsData.blogs.map((blog) => ({
            id: String(blog.id),
            name: blog.title,
            fullName: `Blog: ${blog.title}`,
            metadata: { type: "blog" },
          }))
        );
      } else {
        console.error(
          "Failed to fetch Shopify blogs:",
          blogsRes.status,
          blogsRes.statusText
        );
      }

      return resources;
    } catch (error) {
      console.error("Error fetching Shopify resources:", error);
      return [];
    }
  },

  async push(options: PushOptions): Promise<SyncResult> {
    const { document, connection } = options;
    const config = connection.config as ShopifyConfig;

    if (!config.shop || !config.accessToken) {
      return createErrorResult(document.id, "Missing Shopify configuration");
    }

    // Convert to HTML
    const htmlContent = serializeToHTML(document.content as ContentNode);
    const title = document.title || "Untitled";
    const slug = document.slug;

    const resourceType = config.resourceType || "pages"; // "pages" or "blog" (from metadata.type)
    const resourceId = config.resourceId; // "pages-container" or blog ID

    const headers = {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    };

    try {
      let endpoint = "";
      let payload: any = {};
      let method = "POST";
      let existingId: number | null = null;

      if (resourceType === "pages") {
        // 1. Check if page exists by handle
        const searchRes = await fetch(
          `https://${config.shop}/admin/api/2024-01/pages.json?handle=${slug}`,
          { headers }
        );
        if (searchRes.ok) {
          const searchData = (await searchRes.json()) as {
            pages: Array<{ id: number; handle: string }>;
          };
          // Exact match check
          const existing = searchData.pages.find((p) => p.handle === slug);
          if (existing) {
            existingId = existing.id;
          }
        }

        if (existingId) {
          endpoint = `https://${config.shop}/admin/api/2024-01/pages/${existingId}.json`;
          method = "PUT";
          payload = {
            page: {
              id: existingId,
              title,
              body_html: htmlContent,
              handle: slug,
            },
          };
        } else {
          endpoint = `https://${config.shop}/admin/api/2024-01/pages.json`;
          method = "POST";
          payload = { page: { title, body_html: htmlContent, handle: slug } };
        }
      } else if (resourceType === "blog") {
        // Blog Article
        const blogId = resourceId;
        if (!blogId) {
          return createErrorResult(
            document.id,
            "Blog ID is required for pushing blog articles."
          );
        }

        // Verify blog exists first (optional but good for robustness)
        const blogCheck = await fetch(
          `https://${config.shop}/admin/api/2024-01/blogs/${blogId}.json`,
          { headers }
        );
        if (!blogCheck.ok) {
          return createErrorResult(
            document.id,
            "Target Blog not found on Shopify."
          );
        }

        // 1. Check if article exists in this blog by handle
        const searchRes = await fetch(
          `https://${config.shop}/admin/api/2024-01/blogs/${blogId}/articles.json?handle=${slug}`,
          { headers }
        );
        if (searchRes.ok) {
          const searchData = (await searchRes.json()) as {
            articles: Array<{ id: number; handle: string }>;
          };
          const existing = searchData.articles.find((a) => a.handle === slug);
          if (existing) {
            existingId = existing.id;
          }
        }

        if (existingId) {
          endpoint = `https://${config.shop}/admin/api/2024-01/blogs/${blogId}/articles/${existingId}.json`;
          method = "PUT";
          payload = {
            article: {
              id: existingId,
              title,
              body_html: htmlContent,
              handle: slug,
            },
          };
        } else {
          endpoint = `https://${config.shop}/admin/api/2024-01/blogs/${blogId}/articles.json`;
          method = "POST";
          payload = {
            article: { title, body_html: htmlContent, handle: slug },
          };
        }
      } else {
        return createErrorResult(
          document.id,
          `Unknown resource type: ${resourceType}`
        );
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Shopify API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      // Extract ID
      let finalId = "";
      if (resourceType === "pages" && data.page) finalId = String(data.page.id);
      if (resourceType === "blog" && data.article)
        finalId = String(data.article.id);

      return {
        success: true,
        documentId: document.id,
        externalId: finalId,
        message: existingId ? "Updated successfully" : "Published successfully",
        metadata: {
          shop: config.shop,
          handle: slug,
          url: `https://${config.shop}/${
            resourceType === "pages"
              ? "pages"
              : "blogs/" + (data.article?.blog_id || resourceId)
          }/${slug}`,
        },
      };
    } catch (error: any) {
      console.error("Shopify Push Error:", error);
      return createErrorResult(
        document.id,
        error.message || "Failed to push to Shopify"
      );
    }
  },

  async delete(options: DeleteOptions): Promise<SyncResult> {
    const { documentId, externalId, connection } = options;
    const config = connection.config as ShopifyConfig;

    try {
      if (!config.shop || !config.accessToken) {
        throw new Error("Shop not configured");
      }

      const headers = {
        "X-Shopify-Access-Token": config.accessToken,
        "Content-Type": "application/json",
      };

      const resourceType = config.resourceType || "pages";
      let endpoint = "";

      if (resourceType === "pages") {
        endpoint = `https://${config.shop}/admin/api/2024-01/pages/${externalId}.json`;
      } else if (resourceType === "blog") {
        const blogId = config.resourceId;
        if (!blogId) {
          throw new Error("Blog ID is required for deleting blog articles");
        }
        endpoint = `https://${config.shop}/admin/api/2024-01/blogs/${blogId}/articles/${externalId}.json`;
      } else {
        throw new Error(`Unknown resource type: ${resourceType}`);
      }

      const response = await fetch(endpoint, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Resource doesn't exist, consider deletion successful
          return {
            success: true,
            documentId,
            externalId,
            message: `Resource ${externalId} does not exist, deletion skipped`,
          };
        }
        const errorText = await response.text();
        throw new Error(
          `Shopify API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return {
        success: true,
        documentId,
        externalId,
        message: `Deleted ${resourceType} ${externalId} from ${config.shop}`,
      };
    } catch (error: any) {
      return createErrorResult(
        documentId,
        error.message || "Failed to delete from Shopify"
      );
    }
  },

  async pull(options: PullOptions): Promise<SyncResult[]> {
    const { connection } = options;
    const config = connection.config as ShopifyConfig;
    const results: SyncResult[] = [];

    if (!config.shop || !config.accessToken) {
      console.error("Shopify pull failed: Missing config");
      return [];
    }

    const headers = {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    };

    try {
      // 1. Fetch Pages
      const pagesRes = await fetch(
        `https://${config.shop}/admin/api/2024-01/pages.json?limit=250`,
        { headers }
      );
      if (pagesRes.ok) {
        const pagesData = (await pagesRes.json()) as {
          pages: Array<{
            id: number;
            title: string;
            body_html: string;
            handle: string;
          }>;
        };

        for (const page of pagesData.pages) {
          try {
            // Lossy conversion: HTML -> Text -> TipTap
            // Ideally we would want HTML -> TipTap, but that deserializer is not available yet.
            // We will use deserializeFromText but pass the HTML.
            // The user will see HTML code in the editor, which is better than nothing,
            // or we can try to strip tags if we had a utility.
            // For now, importing as text (raw HTML) is the safest bet to preserve data,
            // allowing the user to copy-paste or the system to be upgraded later.
            const content = deserializeFromHTML(page.body_html || "");

            results.push({
              success: true,
              documentId: "", // Backend handles this
              externalId: String(page.id),
              message: `Pulled page: ${page.title}`,
              metadata: {
                title: page.title,
                slug: page.handle,
                content: content,
                shopifyType: "page",
              },
            });
          } catch (err: any) {
            results.push({
              success: false,
              documentId: "",
              externalId: String(page.id),
              error: `Failed to process page ${page.title}: ${err.message}`,
            });
          }
        }
      }

      // 2. Fetch Blog Posts
      // First get all blogs
      const blogsRes = await fetch(
        `https://${config.shop}/admin/api/2024-01/blogs.json`,
        { headers }
      );
      if (blogsRes.ok) {
        const blogsData = (await blogsRes.json()) as {
          blogs: Array<{ id: number; title: string }>;
        };

        for (const blog of blogsData.blogs) {
          const articlesRes = await fetch(
            `https://${config.shop}/admin/api/2024-01/blogs/${blog.id}/articles.json?limit=250`,
            { headers }
          );
          if (articlesRes.ok) {
            const articlesData = (await articlesRes.json()) as {
              articles: Array<{
                id: number;
                title: string;
                body_html: string;
                handle: string;
              }>;
            };

            for (const article of articlesData.articles) {
              try {
                const content = deserializeFromText(article.body_html || "");

                results.push({
                  success: true,
                  documentId: "",
                  externalId: String(article.id),
                  message: `Pulled article: ${article.title}`,
                  metadata: {
                    title: article.title,
                    slug: article.handle,
                    content: content,
                    shopifyType: "article",
                    blogId: String(blog.id),
                  },
                });
              } catch (err: any) {
                results.push({
                  success: false,
                  documentId: "",
                  externalId: String(article.id),
                  error: `Failed to process article ${article.title}: ${err.message}`,
                });
              }
            }
          }
        }
      }

      return results;
    } catch (error: any) {
      console.error("Shopify Pull Error:", error);
      // Return whatever we managed to collect + error
      results.push({
        success: false,
        documentId: "",
        error: `Fatal error pulling from Shopify: ${error.message}`,
      });
      return results;
    }
  },

  // OAuth Implementation

  getOAuthConfig(): OAuthConfig {
    return {
      authUrl: "", // Dynamic based on shop
      tokenUrl: "", // Dynamic based on shop
      scopes: ["write_content", "read_content", "write_themes", "read_themes"], // Updated scopes
    };
  },

  async getOAuthCredentials(): Promise<OAuthCredentials> {
    return {
      clientId: Resource.ShopifyClientId.value,
      clientSecret: Resource.ShopifyClientSecret.value,
    };
  },

  buildAuthorizationUrl(
    credentials: OAuthCredentials,
    state: string,
    redirectUri: string,
    params?: Record<string, string>
  ): string {
    const shop = params?.shop;
    if (!shop) {
      throw new Error("Shop URL is required for Shopify OAuth");
    }

    // Basic validation/cleaning of shop URL
    const cleanShop = shop
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/.myshopify.com$/, "");
    const shopDomain = `${cleanShop}.myshopify.com`;

    const scopes = shopifyIntegration.getOAuthConfig().scopes.join(",");

    return `https://${shopDomain}/admin/oauth/authorize?client_id=${credentials.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
  },

  async handleOAuthCallback(
    queryParams: Record<string, string>,
    credentials: OAuthCredentials
  ): Promise<ShopifyConfig> {
    const { shop, code, state } = queryParams;

    if (!shop || !code) {
      throw new Error("Missing shop or code parameter");
    }

    // 1. Verify hostname
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
      throw new Error("Invalid shop parameter");
    }

    // 2. Exchange access code for access token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange token: ${errorText}`);
    }

    const data = (await response.json()) as ShopifyTokenResponse;

    return {
      shop,
      accessToken: data.access_token,
      scopes: data.scope.split(","),
    };
  },
};
