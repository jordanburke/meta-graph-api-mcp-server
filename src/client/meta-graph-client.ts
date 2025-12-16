import type {
  CreatePostRequest,
  FacebookComment,
  FacebookPage,
  FacebookPost,
  InstagramBusinessAccount,
  InstagramComment,
  InstagramInsights,
  InstagramMedia,
  InstagramPostRequest,
  MetaApiError,
  MetaGraphClientConfig,
  OAuthTokenResponse,
  PageInsights,
  PaginatedResponse,
  PhotoUploadRequest,
  PostInsights,
} from "../types"

const GRAPH_API_VERSION = "v21.0"
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export class MetaGraphClient {
  private appId: string
  private appSecret: string
  private accessToken?: string
  private userAgent: string

  constructor(config: MetaGraphClientConfig) {
    this.appId = config.appId
    this.appSecret = config.appSecret
    this.accessToken = config.accessToken
    this.userAgent = config.userAgent || "MetaGraphMCPServer/1.0.0"
  }

  // ========== Authentication ==========

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: redirectUri,
      code,
    })

    const response = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params}`)
    return this.handleResponse<OAuthTokenResponse>(response)
  }

  async getLongLivedToken(shortLivedToken: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    })

    const response = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params}`)
    return this.handleResponse<OAuthTokenResponse>(response)
  }

  // ========== Page Management ==========

  async getMyPages(): Promise<FacebookPage[]> {
    const response = await this.makeRequest<PaginatedResponse<FacebookPage>>(
      `/me/accounts?fields=id,name,category,about,description,website,fan_count,followers_count,picture,cover,instagram_business_account,access_token`,
    )
    return response.data || []
  }

  async getPage(pageId: string, pageAccessToken?: string): Promise<FacebookPage> {
    const token = pageAccessToken || this.accessToken
    const response = await this.makeRequest<FacebookPage>(
      `/${pageId}?fields=id,name,category,about,description,website,fan_count,followers_count,picture,cover,instagram_business_account`,
      { accessToken: token },
    )
    return response
  }

  // ========== Post Management ==========

  async createPagePost(pageId: string, request: CreatePostRequest, pageAccessToken: string): Promise<FacebookPost> {
    const body: Record<string, unknown> = {}
    if (request.message) body.message = request.message
    if (request.link) body.link = request.link
    if (request.published !== undefined) body.published = request.published
    if (request.scheduledPublishTime) body.scheduled_publish_time = request.scheduledPublishTime

    const response = await this.makeRequest<{ id: string }>(`/${pageId}/feed`, {
      method: "POST",
      body: JSON.stringify(body),
      accessToken: pageAccessToken,
    })

    // Fetch the created post details
    return this.getPost(response.id, pageAccessToken)
  }

  async getPagePosts(pageId: string, pageAccessToken: string, limit: number = 10): Promise<FacebookPost[]> {
    const response = await this.makeRequest<PaginatedResponse<FacebookPost>>(
      `/${pageId}/posts?fields=id,message,story,created_time,updated_time,permalink_url,full_picture,attachments,shares,reactions.summary(true),comments.summary(true),is_published&limit=${limit}`,
      { accessToken: pageAccessToken },
    )
    return response.data || []
  }

  async getPost(postId: string, pageAccessToken?: string): Promise<FacebookPost> {
    const token = pageAccessToken || this.accessToken
    return this.makeRequest<FacebookPost>(
      `/${postId}?fields=id,message,story,created_time,updated_time,permalink_url,full_picture,attachments,shares,reactions.summary(true),comments.summary(true),is_published`,
      { accessToken: token },
    )
  }

  async deletePost(postId: string, pageAccessToken: string): Promise<void> {
    await this.makeRequest(`/${postId}`, {
      method: "DELETE",
      accessToken: pageAccessToken,
    })
  }

  // ========== Comments ==========

  async getPostComments(postId: string, pageAccessToken: string, limit: number = 25): Promise<FacebookComment[]> {
    const response = await this.makeRequest<PaginatedResponse<FacebookComment>>(
      `/${postId}/comments?fields=id,message,created_time,from,like_count,comment_count,parent,is_hidden&limit=${limit}`,
      { accessToken: pageAccessToken },
    )
    return response.data || []
  }

  async replyToComment(commentId: string, message: string, pageAccessToken: string): Promise<FacebookComment> {
    const response = await this.makeRequest<{ id: string }>(`/${commentId}/comments`, {
      method: "POST",
      body: JSON.stringify({ message }),
      accessToken: pageAccessToken,
    })

    // Fetch the created comment
    return this.makeRequest<FacebookComment>(`/${response.id}?fields=id,message,created_time,from,like_count`, {
      accessToken: pageAccessToken,
    })
  }

  async deleteComment(commentId: string, pageAccessToken: string): Promise<void> {
    await this.makeRequest(`/${commentId}`, {
      method: "DELETE",
      accessToken: pageAccessToken,
    })
  }

  // ========== Media Upload ==========

  async uploadPhoto(
    pageId: string,
    request: PhotoUploadRequest,
    pageAccessToken: string,
  ): Promise<{ id: string; postId?: string }> {
    const body: Record<string, unknown> = {}
    if (request.url) body.url = request.url
    if (request.caption) body.caption = request.caption
    if (request.published !== undefined) body.published = request.published

    const response = await this.makeRequest<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
      method: "POST",
      body: JSON.stringify(body),
      accessToken: pageAccessToken,
    })

    return { id: response.id, postId: response.post_id }
  }

  // ========== Page Insights ==========

  async getPageInsights(
    pageId: string,
    pageAccessToken: string,
    metrics: string[] = ["page_impressions", "page_engaged_users", "page_fans"],
    period: string = "day",
  ): Promise<PageInsights> {
    const response = await this.makeRequest<PaginatedResponse<RawInsightMetric>>(
      `/${pageId}/insights?metric=${metrics.join(",")}&period=${period}`,
      { accessToken: pageAccessToken },
    )

    // Transform snake_case API response to camelCase
    return {
      pageId,
      period,
      metrics: (response.data || []).map((m) => ({
        name: m.name,
        title: m.title,
        description: m.description,
        period: m.period,
        values: m.values.map((v) => ({ value: v.value, endTime: v.end_time })),
      })),
    }
  }

  async getPostInsights(postId: string, pageAccessToken: string): Promise<PostInsights> {
    const response = await this.makeRequest<PaginatedResponse<{ name: string; values: Array<{ value: number }> }>>(
      `/${postId}/insights?metric=post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total`,
      { accessToken: pageAccessToken },
    )

    const metrics = response.data || []
    const getValue = (name: string): number => {
      const metric = metrics.find((m) => m.name === name)
      return metric?.values?.[0]?.value || 0
    }

    return {
      postId,
      impressions: getValue("post_impressions"),
      engagement: getValue("post_engaged_users"),
      clicks: getValue("post_clicks"),
    }
  }

  // ========== Instagram Business ==========

  async getInstagramAccount(pageId: string, pageAccessToken: string): Promise<InstagramBusinessAccount | null> {
    const page = await this.makeRequest<{ instagram_business_account?: { id: string } }>(
      `/${pageId}?fields=instagram_business_account`,
      { accessToken: pageAccessToken },
    )

    if (!page.instagram_business_account?.id) return null

    return this.makeRequest<InstagramBusinessAccount>(
      `/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website`,
      { accessToken: pageAccessToken },
    )
  }

  async getInstagramMedia(igAccountId: string, pageAccessToken: string, limit: number = 10): Promise<InstagramMedia[]> {
    const response = await this.makeRequest<PaginatedResponse<InstagramMedia>>(
      `/${igAccountId}/media?fields=id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count&limit=${limit}`,
      { accessToken: pageAccessToken },
    )
    return response.data || []
  }

  async createInstagramPost(
    igAccountId: string,
    request: InstagramPostRequest,
    pageAccessToken: string,
  ): Promise<InstagramMedia> {
    // Step 1: Create media container
    const container = await this.makeRequest<{ id: string }>(`/${igAccountId}/media`, {
      method: "POST",
      body: JSON.stringify({
        image_url: request.imageUrl,
        caption: request.caption,
      }),
      accessToken: pageAccessToken,
    })

    // Step 2: Publish the container
    const published = await this.makeRequest<{ id: string }>(`/${igAccountId}/media_publish`, {
      method: "POST",
      body: JSON.stringify({ creation_id: container.id }),
      accessToken: pageAccessToken,
    })

    // Return the published media details
    return this.makeRequest<InstagramMedia>(
      `/${published.id}?fields=id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count`,
      { accessToken: pageAccessToken },
    )
  }

  async getInstagramComments(
    mediaId: string,
    pageAccessToken: string,
    limit: number = 25,
  ): Promise<InstagramComment[]> {
    const response = await this.makeRequest<PaginatedResponse<InstagramComment>>(
      `/${mediaId}/comments?fields=id,text,timestamp,username,like_count&limit=${limit}`,
      { accessToken: pageAccessToken },
    )
    return response.data || []
  }

  async replyToInstagramComment(
    commentId: string,
    message: string,
    pageAccessToken: string,
  ): Promise<InstagramComment> {
    const response = await this.makeRequest<{ id: string }>(`/${commentId}/replies`, {
      method: "POST",
      body: JSON.stringify({ message }),
      accessToken: pageAccessToken,
    })

    return this.makeRequest<InstagramComment>(`/${response.id}?fields=id,text,timestamp,username,like_count`, {
      accessToken: pageAccessToken,
    })
  }

  async getInstagramInsights(
    igAccountId: string,
    pageAccessToken: string,
    metrics: string[] = ["impressions", "reach", "follower_count"],
    period: string = "day",
  ): Promise<InstagramInsights> {
    const response = await this.makeRequest<
      PaginatedResponse<{ name: string; period: string; values: Array<{ value: number; end_time?: string }> }>
    >(`/${igAccountId}/insights?metric=${metrics.join(",")}&period=${period}`, { accessToken: pageAccessToken })

    return {
      accountId: igAccountId,
      metrics: (response.data || []).map((m) => ({
        name: m.name,
        period: m.period,
        values: m.values.map((v) => ({ value: v.value, endTime: v.end_time })),
      })),
    }
  }

  // ========== Private Helpers ==========

  private async makeRequest<T>(
    path: string,
    options: {
      method?: string
      body?: string
      accessToken?: string
    } = {},
  ): Promise<T> {
    const token = options.accessToken || this.accessToken
    if (!token) throw new Error("No access token available")

    const url = path.startsWith("http") ? path : `${GRAPH_API_BASE}${path}`
    const separator = url.includes("?") ? "&" : "?"
    const fullUrl = `${url}${separator}access_token=${token}`

    const response = await fetch(fullUrl, {
      method: options.method || "GET",
      headers: {
        "User-Agent": this.userAgent,
        "Content-Type": "application/json",
      },
      body: options.body,
    })

    return this.handleResponse<T>(response)
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json()

    if (!response.ok || data.error) {
      const error = data as MetaApiError
      throw new Error(`Meta API Error [${error.error?.code}]: ${error.error?.message || "Unknown error"}`)
    }

    return data as T
  }
}

// ========== Singleton Pattern ==========
let metaGraphClient: MetaGraphClient | null = null

export function initializeMetaGraphClient(config: MetaGraphClientConfig): MetaGraphClient {
  metaGraphClient = new MetaGraphClient(config)
  return metaGraphClient
}

export function getMetaGraphClient(): MetaGraphClient | null {
  return metaGraphClient
}

// Local type for raw API response (uses snake_case from Facebook API)
type RawInsightMetric = {
  name: string
  title: string
  description: string
  period: string
  values: Array<{ value: number | Record<string, number>; end_time: string }>
}
