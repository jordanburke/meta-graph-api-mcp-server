// ========== Configuration Types ==========
export type MetaGraphClientConfig = {
  appId: string
  appSecret: string
  accessToken?: string
  userAgent?: string
}

// ========== Session Types ==========
export type MetaSession = {
  userAccessToken: string
  userId: string
  userName?: string
  expiresAt?: number
  pageTokens: Record<string, PageTokenInfo>
}

export type PageTokenInfo = {
  accessToken: string
  name: string
  category?: string
  instagramBusinessAccountId?: string
}

// ========== Page Types ==========
export type FacebookPage = {
  id: string
  name: string
  category?: string
  about?: string
  description?: string
  website?: string
  followerCount?: number
  fanCount?: number
  picture?: { url: string }
  cover?: { source: string }
  instagramBusinessAccount?: { id: string }
  accessToken?: string
}

// ========== Post Types ==========
export type FacebookPost = {
  id: string
  pageId?: string
  message?: string
  story?: string
  createdTime: string
  updatedTime?: string
  permalinkUrl?: string
  fullPicture?: string
  attachments?: PostAttachment[]
  shares?: { count: number }
  reactions?: { summary: { total_count: number } }
  comments?: { summary: { total_count: number } }
  isPublished?: boolean
}

export type PostAttachment = {
  type: "photo" | "video" | "link" | "album" | "share"
  url?: string
  title?: string
  description?: string
  media?: { image?: { src: string } }
}

export type CreatePostRequest = {
  message?: string
  link?: string
  published?: boolean
  scheduledPublishTime?: number
}

// ========== Comment Types ==========
export type FacebookComment = {
  id: string
  message: string
  createdTime: string
  from?: { id: string; name: string }
  likeCount?: number
  commentCount?: number
  parentId?: string
  isHidden?: boolean
}

// ========== Media Types ==========
export type PhotoUploadRequest = {
  url?: string
  caption?: string
  published?: boolean
}

export type VideoUploadRequest = {
  url: string
  title?: string
  description?: string
  published?: boolean
}

export type MediaUploadResponse = {
  id: string
  postId?: string
}

// ========== Insights Types ==========
export type PageInsights = {
  pageId: string
  period: string
  metrics: InsightMetric[]
}

export type InsightMetric = {
  name: string
  title: string
  description: string
  period: string
  values: Array<{
    value: number | Record<string, number>
    endTime: string
  }>
}

export type PostInsights = {
  postId: string
  impressions?: number
  reach?: number
  engagement?: number
  reactions?: number
  comments?: number
  shares?: number
  clicks?: number
}

// ========== Instagram Types ==========
export type InstagramBusinessAccount = {
  id: string
  username: string
  name?: string
  profilePictureUrl?: string
  followersCount?: number
  followsCount?: number
  mediaCount?: number
  biography?: string
  website?: string
}

export type InstagramMedia = {
  id: string
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  mediaUrl?: string
  thumbnailUrl?: string
  permalink: string
  caption?: string
  timestamp: string
  likeCount?: number
  commentsCount?: number
}

export type InstagramPostRequest = {
  imageUrl: string
  caption?: string
}

export type InstagramComment = {
  id: string
  text: string
  timestamp: string
  username: string
  likeCount?: number
}

export type InstagramInsights = {
  accountId: string
  metrics: Array<{
    name: string
    period: string
    values: Array<{
      value: number
      endTime?: string
    }>
  }>
}

// ========== API Response Types ==========
export type MetaApiError = {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id: string
  }
}

export type PaginatedResponse<T> = {
  data: T[]
  paging?: {
    cursors?: { before: string; after: string }
    next?: string
    previous?: string
  }
}

// ========== OAuth Types ==========
export type OAuthTokenResponse = {
  access_token: string
  token_type: string
  expires_in?: number
}
