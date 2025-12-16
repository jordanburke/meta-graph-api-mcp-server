import type {
  FacebookComment,
  FacebookPage,
  FacebookPost,
  InstagramBusinessAccount,
  InstagramComment,
  InstagramInsights,
  InstagramMedia,
  PageInsights,
  PostInsights,
} from "../types"

// ========== Page Formatters ==========

export function formatPageDetailed(page: FacebookPage): string {
  const lines = [
    `# ${page.name}`,
    "",
    "## Page Information",
    `- **ID**: ${page.id}`,
    `- **Category**: ${page.category || "N/A"}`,
    `- **Fans**: ${page.fanCount?.toLocaleString() || "N/A"}`,
    `- **Followers**: ${page.followerCount?.toLocaleString() || "N/A"}`,
  ]

  if (page.website) lines.push(`- **Website**: ${page.website}`)
  if (page.about) {
    lines.push("", "## About", page.about)
  }
  if (page.description) {
    lines.push("", "## Description", page.description)
  }
  if (page.instagramBusinessAccount) {
    lines.push("", `## Instagram`, `- **Connected Account ID**: ${page.instagramBusinessAccount.id}`)
  }

  return lines.join("\n")
}

export function formatPageList(pages: FacebookPage[]): string {
  if (pages.length === 0) return "No pages found."

  const lines = [`# Your Facebook Pages (${pages.length})`, ""]

  pages.forEach((page, i) => {
    lines.push(`## ${i + 1}. ${page.name}`)
    lines.push(`- **ID**: ${page.id}`)
    lines.push(`- **Category**: ${page.category || "N/A"}`)
    lines.push(`- **Fans**: ${page.fanCount?.toLocaleString() || "N/A"}`)
    if (page.instagramBusinessAccount) {
      lines.push(`- **Instagram**: Connected (${page.instagramBusinessAccount.id})`)
    }
    lines.push("")
  })

  return lines.join("\n")
}

// ========== Post Formatters ==========

export function formatPostDetailed(post: FacebookPost, insights?: PostInsights): string {
  const lines = [
    `# Facebook Post`,
    "",
    "## Post Information",
    `- **ID**: ${post.id}`,
    `- **Created**: ${new Date(post.createdTime).toLocaleString()}`,
    `- **Status**: ${post.isPublished !== false ? "Published" : "Draft/Scheduled"}`,
  ]

  if (post.permalinkUrl) lines.push(`- **URL**: ${post.permalinkUrl}`)

  lines.push("", "## Content")
  lines.push(post.message || post.story || "_No text content_")

  if (post.fullPicture) {
    lines.push("", "## Media", `- **Image**: ${post.fullPicture}`)
  }

  lines.push("", "## Engagement")
  lines.push(`- **Reactions**: ${post.reactions?.summary?.total_count || 0}`)
  lines.push(`- **Comments**: ${post.comments?.summary?.total_count || 0}`)
  lines.push(`- **Shares**: ${post.shares?.count || 0}`)

  if (insights) {
    lines.push("", "## Analytics")
    if (insights.impressions) lines.push(`- **Impressions**: ${insights.impressions.toLocaleString()}`)
    if (insights.reach) lines.push(`- **Reach**: ${insights.reach.toLocaleString()}`)
    if (insights.engagement) lines.push(`- **Engaged Users**: ${insights.engagement.toLocaleString()}`)
    if (insights.clicks) lines.push(`- **Clicks**: ${insights.clicks.toLocaleString()}`)
  }

  return lines.join("\n")
}

export function formatPostList(posts: FacebookPost[]): string {
  if (posts.length === 0) return "No posts found."

  const lines = [`# Page Posts (${posts.length})`, ""]

  posts.forEach((post, i) => {
    const preview = (post.message || post.story || "").slice(0, 100)
    lines.push(`## ${i + 1}. Post ${post.id}`)
    lines.push(`- **Created**: ${new Date(post.createdTime).toLocaleString()}`)
    lines.push(`- **Content**: ${preview}${preview.length >= 100 ? "..." : ""}`)
    lines.push(
      `- **Reactions**: ${post.reactions?.summary?.total_count || 0} | **Comments**: ${post.comments?.summary?.total_count || 0} | **Shares**: ${post.shares?.count || 0}`,
    )
    if (post.permalinkUrl) lines.push(`- **URL**: ${post.permalinkUrl}`)
    lines.push("")
  })

  return lines.join("\n")
}

// ========== Comment Formatters ==========

export function formatCommentDetailed(comment: FacebookComment): string {
  const lines = [
    `# Comment`,
    "",
    `- **ID**: ${comment.id}`,
    `- **From**: ${comment.from?.name || "Unknown"}`,
    `- **Created**: ${new Date(comment.createdTime).toLocaleString()}`,
    `- **Likes**: ${comment.likeCount || 0}`,
    `- **Replies**: ${comment.commentCount || 0}`,
    "",
    "## Message",
    comment.message,
  ]

  return lines.join("\n")
}

export function formatCommentList(comments: FacebookComment[]): string {
  if (comments.length === 0) return "No comments found."

  const lines = [`# Comments (${comments.length})`, ""]

  comments.forEach((comment, i) => {
    lines.push(`## ${i + 1}. ${comment.from?.name || "Unknown"}`)
    lines.push(`- **ID**: ${comment.id}`)
    lines.push(`- **Created**: ${new Date(comment.createdTime).toLocaleString()}`)
    lines.push(`- **Likes**: ${comment.likeCount || 0}`)
    lines.push(`> ${comment.message}`)
    lines.push("")
  })

  return lines.join("\n")
}

// ========== Insights Formatters ==========

export function formatPageInsights(insights: PageInsights): string {
  const lines = [
    `# Page Insights`,
    "",
    `- **Page ID**: ${insights.pageId}`,
    `- **Period**: ${insights.period}`,
    "",
    "## Metrics",
  ]

  insights.metrics.forEach((metric) => {
    lines.push("", `### ${metric.title || metric.name}`)
    if (metric.description) lines.push(`_${metric.description}_`)
    lines.push("")

    metric.values.forEach((v) => {
      const value = typeof v.value === "object" ? JSON.stringify(v.value) : v.value.toLocaleString()
      lines.push(`- ${new Date(v.endTime).toLocaleDateString()}: **${value}**`)
    })
  })

  return lines.join("\n")
}

export function formatPostInsights(insights: PostInsights): string {
  const lines = [
    `# Post Insights`,
    "",
    `- **Post ID**: ${insights.postId}`,
    "",
    "## Metrics",
    `- **Impressions**: ${insights.impressions?.toLocaleString() || "N/A"}`,
    `- **Reach**: ${insights.reach?.toLocaleString() || "N/A"}`,
    `- **Engaged Users**: ${insights.engagement?.toLocaleString() || "N/A"}`,
    `- **Clicks**: ${insights.clicks?.toLocaleString() || "N/A"}`,
    `- **Reactions**: ${insights.reactions?.toLocaleString() || "N/A"}`,
    `- **Comments**: ${insights.comments?.toLocaleString() || "N/A"}`,
    `- **Shares**: ${insights.shares?.toLocaleString() || "N/A"}`,
  ]

  return lines.join("\n")
}

// ========== Instagram Formatters ==========

export function formatInstagramAccountDetailed(account: InstagramBusinessAccount): string {
  const lines = [
    `# Instagram Business Account`,
    "",
    "## Profile",
    `- **ID**: ${account.id}`,
    `- **Username**: @${account.username}`,
    `- **Name**: ${account.name || "N/A"}`,
    `- **Followers**: ${account.followersCount?.toLocaleString() || "N/A"}`,
    `- **Following**: ${account.followsCount?.toLocaleString() || "N/A"}`,
    `- **Posts**: ${account.mediaCount?.toLocaleString() || "N/A"}`,
  ]

  if (account.website) lines.push(`- **Website**: ${account.website}`)
  if (account.biography) {
    lines.push("", "## Bio", account.biography)
  }

  return lines.join("\n")
}

export function formatInstagramMediaDetailed(media: InstagramMedia): string {
  const lines = [
    `# Instagram Post`,
    "",
    "## Media Information",
    `- **ID**: ${media.id}`,
    `- **Type**: ${media.mediaType}`,
    `- **Posted**: ${new Date(media.timestamp).toLocaleString()}`,
    `- **URL**: ${media.permalink}`,
    "",
    "## Engagement",
    `- **Likes**: ${media.likeCount?.toLocaleString() || 0}`,
    `- **Comments**: ${media.commentsCount?.toLocaleString() || 0}`,
  ]

  if (media.caption) {
    lines.push("", "## Caption", media.caption)
  }

  return lines.join("\n")
}

export function formatInstagramMediaList(media: InstagramMedia[]): string {
  if (media.length === 0) return "No Instagram posts found."

  const lines = [`# Instagram Posts (${media.length})`, ""]

  media.forEach((m, i) => {
    const caption = (m.caption || "").slice(0, 80)
    lines.push(`## ${i + 1}. ${m.mediaType} Post`)
    lines.push(`- **ID**: ${m.id}`)
    lines.push(`- **Posted**: ${new Date(m.timestamp).toLocaleString()}`)
    lines.push(`- **Caption**: ${caption}${caption.length >= 80 ? "..." : ""}`)
    lines.push(`- **Likes**: ${m.likeCount || 0} | **Comments**: ${m.commentsCount || 0}`)
    lines.push(`- **URL**: ${m.permalink}`)
    lines.push("")
  })

  return lines.join("\n")
}

export function formatInstagramCommentList(comments: InstagramComment[]): string {
  if (comments.length === 0) return "No comments found."

  const lines = [`# Instagram Comments (${comments.length})`, ""]

  comments.forEach((comment, i) => {
    lines.push(`## ${i + 1}. @${comment.username}`)
    lines.push(`- **ID**: ${comment.id}`)
    lines.push(`- **Posted**: ${new Date(comment.timestamp).toLocaleString()}`)
    lines.push(`- **Likes**: ${comment.likeCount || 0}`)
    lines.push(`> ${comment.text}`)
    lines.push("")
  })

  return lines.join("\n")
}

export function formatInstagramInsights(insights: InstagramInsights): string {
  const lines = [`# Instagram Insights`, "", `- **Account ID**: ${insights.accountId}`, "", "## Metrics"]

  insights.metrics.forEach((metric) => {
    lines.push("", `### ${metric.name}`)
    lines.push(`- **Period**: ${metric.period}`)

    metric.values.forEach((v) => {
      const date = v.endTime ? new Date(v.endTime).toLocaleDateString() : "Current"
      lines.push(`- ${date}: **${v.value.toLocaleString()}**`)
    })
  })

  return lines.join("\n")
}

// ========== Error Formatter ==========

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `Error: ${error.message}`
  }
  return `Error: ${String(error)}`
}
