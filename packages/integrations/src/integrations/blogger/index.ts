import type {
  Integration,
  IntegrationConnection,
  PushOptions,
  PullOptions,
  DeleteOptions,
  SyncResult,
  ExternalResource,
  DefaultLink,
} from "@lydie/core/integrations/types"
import { createErrorResult } from "@lydie/core/integrations/types"
import type { OAuthConfig, OAuthCredentials, OAuthIntegration } from "@lydie/core/integrations/oauth"
import { Resource } from "sst"
import { serializeToHTML, deserializeFromHTML } from "@lydie/core/serialization/html"
import type { ContentNode } from "@lydie/core/content"

export interface BloggerConfig {
  accessToken: string
  refreshToken?: string
  blogId?: string // Optional: specific blog ID to use
  blogUrl?: string // Optional: blog URL (alternative to blogId)
  resourceType?: string // "posts" or "pages"
  resourceId?: string // Resource ID from fetchResources (e.g., "blogId-posts")
}

interface BloggerTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

interface BloggerBlog {
  id: string
  name: string
  url: string
  description?: string
}

interface BloggerPost {
  id: string
  title: string
  content: string
  published: string
  updated: string
  url: string
  selfLink: string
}

interface BloggerPage {
  id: string
  title: string
  content: string
  published: string
  updated: string
  url: string
  selfLink: string
}

function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
}

// Blogger sync integration - syncs documents to Google Blogger via REST API
export const bloggerIntegration: Integration & OAuthIntegration = {
  onConnect(): { links?: DefaultLink[] } {
    return {
      links: [
        { name: "Posts", config: { type: "posts" } },
        { name: "Pages", config: { type: "pages" } },
      ],
    }
  },

  async validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean
    error?: string
  }> {
    const config = connection.config as BloggerConfig
    if (!config.accessToken) {
      return {
        valid: false,
        error: "Missing required configuration: access token",
      }
    }

    try {
      const response = await fetch("https://www.googleapis.com/blogger/v3/users/self", {
        headers: getAuthHeaders(config.accessToken),
      })

      if (!response.ok) {
        if (response.status === 401) {
          // Token might be expired, try to refresh if we have refresh token
          if (config.refreshToken) {
            try {
              const refreshed = await this.refreshAccessToken?.(
                config.refreshToken,
                await this.getOAuthCredentials(),
              )
              if (refreshed) {
                return { valid: true }
              }
            } catch (refreshError) {
              return {
                valid: false,
                error: "Access token expired and refresh failed",
              }
            }
          }
          return {
            valid: false,
            error: "Invalid or expired access token",
          }
        }
        return {
          valid: false,
          error: `Connection failed: ${response.status} ${response.statusText}`,
        }
      }

      return { valid: true }
    } catch (error: any) {
      return {
        valid: false,
        error: `Connection error: ${error.message}`,
      }
    }
  },

  async fetchResources(connection: IntegrationConnection): Promise<ExternalResource[]> {
    const config = connection.config as BloggerConfig
    if (!config.accessToken) {
      return []
    }

    const headers = getAuthHeaders(config.accessToken)
    const resources: ExternalResource[] = []

    try {
      const response = await fetch("https://www.googleapis.com/blogger/v3/users/self/blogs", {
        headers,
      })

      if (response.ok) {
        const data = (await response.json()) as {
          items?: BloggerBlog[]
        }

        if (data.items) {
          for (const blog of data.items) {
            resources.push({
              id: `${blog.id}-posts`,
              name: `${blog.name} - Posts`,
              fullName: `Blog: ${blog.name} - Posts`,
              metadata: { type: "posts", blogId: blog.id, blogName: blog.name },
            })

            resources.push({
              id: `${blog.id}-pages`,
              name: `${blog.name} - Pages`,
              fullName: `Blog: ${blog.name} - Pages`,
              metadata: { type: "pages", blogId: blog.id, blogName: blog.name },
            })
          }
        }
      } else {
        console.error("Failed to fetch Blogger blogs:", response.status, response.statusText)
      }

      return resources
    } catch (error) {
      console.error("Error fetching Blogger resources:", error)
      return []
    }
  },

  async push(options: PushOptions): Promise<SyncResult> {
    const { document, connection } = options
    const config = connection.config as BloggerConfig

    if (!config.accessToken) {
      return createErrorResult(document.id, "Missing Blogger access token")
    }

    // Get blog ID from config (can be extracted from resourceId: "blogId-posts" or "blogId-pages")
    let blogId = config.blogId
    if (!blogId && config.resourceId) {
      const parts = config.resourceId.split("-")
      if (parts.length >= 2) {
        blogId = parts.slice(0, -1).join("-") // Handle blog IDs with hyphens
      }
    }

    if (!blogId) {
      return createErrorResult(document.id, "Blog ID is required. Please select a blog resource.")
    }

    const htmlContent = serializeToHTML(document.content as ContentNode)
    const title = document.title || "Untitled"
    const slug = document.slug

    const resourceType = config.resourceType || "posts"

    const headers = getAuthHeaders(config.accessToken)

    try {
      let endpoint = ""
      let method = "POST"
      let existingId: string | null = null

      // Check if post/page exists by searching
      // Blogger API doesn't support direct slug search, so we fetch recent items and check URLs
      const searchEndpoint =
        resourceType === "pages"
          ? `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages?maxResults=500`
          : `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=500`

      const searchRes = await fetch(searchEndpoint, { headers })

      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as {
          items?: Array<{ id: string; url: string }>
        }

        if (searchData.items) {
          // Try to find by URL - Blogger URLs typically end with the slug
          const matchingItem = searchData.items.find((item) => {
            const urlParts = item.url.split("/")
            const urlSlug = urlParts[urlParts.length - 1]?.replace(/\.html$/, "")
            return urlSlug === slug || item.url.includes(slug)
          })

          if (matchingItem) {
            existingId = matchingItem.id
          }
        }
      }

      const payload: any = {
        title,
        content: htmlContent,
      }

      // Blogger doesn't support custom slugs directly via API - slug is auto-generated from title

      if (existingId) {
        endpoint =
          resourceType === "pages"
            ? `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages/${existingId}`
            : `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${existingId}`
        method = "PUT"
        payload.id = existingId
      } else {
        endpoint =
          resourceType === "pages"
            ? `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages`
            : `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`
        method = "POST"
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Blogger API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = (await response.json()) as BloggerPost | BloggerPage
      const finalId = data.id

      return {
        success: true,
        documentId: document.id,
        externalId: finalId,
        message: existingId ? "Updated successfully" : "Published successfully",
        metadata: {
          blogId,
          url: data.url,
          link: data.url,
          type: resourceType,
        },
      }
    } catch (error: any) {
      console.error("Blogger Push Error:", error)
      return createErrorResult(document.id, error.message || "Failed to push to Blogger")
    }
  },

  async delete(options: DeleteOptions): Promise<SyncResult> {
    const { documentId, externalId, connection } = options
    const config = connection.config as BloggerConfig

    try {
      if (!config.accessToken) {
        throw new Error("Blogger access token not configured")
      }

      let blogId = config.blogId
      if (!blogId && config.resourceId) {
        const parts = config.resourceId.split("-")
        if (parts.length >= 2) {
          blogId = parts.slice(0, -1).join("-")
        }
      }

      if (!blogId) {
        throw new Error("Blog ID is required for deletion")
      }

      const resourceType = config.resourceType || "posts"

      const headers = getAuthHeaders(config.accessToken)

      const endpoint =
        resourceType === "pages"
          ? `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages/${externalId}`
          : `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${externalId}`

      const response = await fetch(endpoint, {
        method: "DELETE",
        headers,
      })

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            documentId,
            externalId,
            message: `Resource ${externalId} does not exist, deletion skipped`,
          }
        }
        const errorText = await response.text()
        throw new Error(`Blogger API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      return {
        success: true,
        documentId,
        externalId,
        message: `Deleted ${resourceType} ${externalId} from Blogger`,
      }
    } catch (error: any) {
      return createErrorResult(documentId, error.message || "Failed to delete from Blogger")
    }
  },

  async pull(options: PullOptions): Promise<SyncResult[]> {
    const { connection } = options
    const config = connection.config as BloggerConfig
    const results: SyncResult[] = []

    if (!config.accessToken) {
      console.error("Blogger pull failed: Missing access token")
      return []
    }

    const headers = getAuthHeaders(config.accessToken)

    try {
      const blogId = config.blogId
      const blogsToProcess: Array<{ id: string; name: string }> = []

      if (blogId) {
        const blogRes = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}`, {
          headers,
        })
        if (blogRes.ok) {
          const blog = (await blogRes.json()) as BloggerBlog
          blogsToProcess.push({ id: blog.id, name: blog.name })
        }
      } else {
        const blogsRes = await fetch("https://www.googleapis.com/blogger/v3/users/self/blogs", {
          headers,
        })
        if (blogsRes.ok) {
          const blogsData = (await blogsRes.json()) as {
            items?: BloggerBlog[]
          }
          if (blogsData.items) {
            blogsToProcess.push(...blogsData.items.map((b) => ({ id: b.id, name: b.name })))
          }
        }
      }

      for (const blog of blogsToProcess) {
        const postsRes = await fetch(
          `https://www.googleapis.com/blogger/v3/blogs/${blog.id}/posts?maxResults=500`,
          { headers },
        )
        if (postsRes.ok) {
          const postsData = (await postsRes.json()) as {
            items?: BloggerPost[]
          }
          if (postsData.items) {
            for (const post of postsData.items) {
              try {
                const content = deserializeFromHTML(post.content || "")

                results.push({
                  success: true,
                  documentId: "",
                  externalId: post.id,
                  message: `Pulled post: ${post.title}`,
                  metadata: {
                    title: post.title,
                    slug: post.url.split("/").pop() || "",
                    content: content,
                    bloggerType: "post",
                    blogId: blog.id,
                    blogName: blog.name,
                    url: post.url,
                  },
                })
              } catch (err: any) {
                results.push({
                  success: false,
                  documentId: "",
                  externalId: post.id,
                  error: `Failed to process post ${post.title}: ${err.message}`,
                })
              }
            }
          }
        }

        // Fetch Pages
        const pagesRes = await fetch(
          `https://www.googleapis.com/blogger/v3/blogs/${blog.id}/pages?maxResults=500`,
          { headers },
        )
        if (pagesRes.ok) {
          const pagesData = (await pagesRes.json()) as {
            items?: BloggerPage[]
          }
          if (pagesData.items) {
            for (const page of pagesData.items) {
              try {
                const content = deserializeFromHTML(page.content || "")

                results.push({
                  success: true,
                  documentId: "",
                  externalId: page.id,
                  message: `Pulled page: ${page.title}`,
                  metadata: {
                    title: page.title,
                    slug: page.url.split("/").pop() || "",
                    content: content,
                    bloggerType: "page",
                    blogId: blog.id,
                    blogName: blog.name,
                    url: page.url,
                  },
                })
              } catch (err: any) {
                results.push({
                  success: false,
                  documentId: "",
                  externalId: page.id,
                  error: `Failed to process page ${page.title}: ${err.message}`,
                })
              }
            }
          }
        }
      }

      return results
    } catch (error: any) {
      console.error("Blogger Pull Error:", error)
      results.push({
        success: false,
        documentId: "",
        error: `Fatal error pulling from Blogger: ${error.message}`,
      })
      return results
    }
  },

  // OAuth Implementation

  getOAuthConfig(): OAuthConfig {
    return {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/blogger"],
    }
  },

  async getOAuthCredentials(): Promise<OAuthCredentials> {
    return {
      clientId: Resource.GoogleClientId.value,
      clientSecret: Resource.GoogleClientSecret.value,
    }
  },

  buildAuthorizationUrl(
    credentials: OAuthCredentials,
    state: string,
    redirectUri: string,
    params?: Record<string, string>,
  ): string {
    const scopes = this.getOAuthConfig().scopes.join(" ")
    const paramsObj = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      state: state,
      access_type: "offline", // Request refresh token
      prompt: "consent", // Force consent to get refresh token
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${paramsObj.toString()}`
  },

  async handleOAuthCallback(
    queryParams: Record<string, string>,
    credentials: OAuthCredentials,
    redirectUri: string,
  ): Promise<BloggerConfig> {
    const { code, error } = queryParams

    if (error) {
      throw new Error(`OAuth error: ${error}`)
    }

    if (!code) {
      throw new Error("Missing authorization code")
    }

    const tokenUrl = "https://oauth2.googleapis.com/token"
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to exchange token: ${errorText}`)
    }

    const data = (await response.json()) as BloggerTokenResponse

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }
  },

  async refreshAccessToken(
    refreshToken: string,
    credentials: OAuthCredentials,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    const tokenUrl = "https://oauth2.googleapis.com/token"
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to refresh token: ${errorText}`)
    }

    const data = (await response.json()) as BloggerTokenResponse
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
    }
  },
}
