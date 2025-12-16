import crypto from "crypto"
import dotenv from "dotenv"
import { FastMCP } from "fastmcp"
import http from "http"
import { z } from "zod"

import { MetaGraphClient } from "./client/meta-graph-client"
import type { MetaSession, PageTokenInfo } from "./types"
import {
  formatCommentDetailed,
  formatCommentList,
  formatInstagramAccountDetailed,
  formatInstagramCommentList,
  formatInstagramInsights,
  formatInstagramMediaDetailed,
  formatInstagramMediaList,
  formatPageDetailed,
  formatPageInsights,
  formatPageList,
  formatPostDetailed,
  formatPostInsights,
  formatPostList,
} from "./utils/formatters"

// Load environment variables
dotenv.config()

// Facebook OAuth endpoints
const FACEBOOK_AUTH_ENDPOINT = "https://www.facebook.com/v21.0/dialog/oauth"
const FACEBOOK_TOKEN_ENDPOINT = "https://graph.facebook.com/v21.0/oauth/access_token"

// Facebook OAuth scopes
const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "pages_manage_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
]

// Get configuration from environment
const appId = process.env.FACEBOOK_APP_ID
const appSecret = process.env.FACEBOOK_APP_SECRET
const serverPort = parseInt(process.env.PORT || "3000")
const serverHost = process.env.HOST || "localhost"
const baseUrl = process.env.BASE_URL || `http://${serverHost}:${serverPort}`
const mcpPort = serverPort + 1
const mcpUrl = `http://${serverHost}:${mcpPort}`
const userAgent = process.env.META_USER_AGENT || "MetaGraphMCPServer/1.0.0"

// Validate required credentials
if (!appId || !appSecret) {
  console.error("[Error] Missing required Meta API credentials.")
  console.error("  Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET environment variables.")
  process.exit(1)
}

// ========== JWT Utilities ==========
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex")

function createJWT(payload: Record<string, unknown>, expiresIn: number = 3600): string {
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomBytes(16).toString("hex"),
  }

  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const headerB64 = encode(header)
  const payloadB64 = encode(fullPayload)
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64url")

  return `${headerB64}.${payloadB64}.${signature}`
}

function verifyJWT(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const [headerB64, payloadB64, signature] = token.split(".")
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64url")

    if (signature !== expectedSig) return { valid: false }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return { valid: false }

    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// ========== OAuth State Management ==========
type OAuthTransaction = {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge?: string
  codeChallengeMethod?: string
  scope: string[]
  createdAt: number
}

type AuthCode = {
  clientId: string
  redirectUri: string
  metaTokens: MetaSession
  createdAt: number
  used: boolean
}

const transactions = new Map<string, OAuthTransaction>()
const authCodes = new Map<string, AuthCode>()
const registeredClients = new Map<string, { redirectUris: string[]; createdAt: number }>()
const tokenStore = new Map<string, { metaTokens: MetaSession; createdAt: number }>()

// Cleanup expired items
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of transactions.entries()) if (now - v.createdAt > 600000) transactions.delete(k)
  for (const [k, v] of authCodes.entries()) if (now - v.createdAt > 300000) authCodes.delete(k)
  for (const [k, v] of tokenStore.entries()) if (now - v.createdAt > 3600000) tokenStore.delete(k)
}, 60000)

// ========== Facebook Token Exchange ==========
async function exchangeFacebookCode(code: string, redirectUri: string): Promise<MetaSession> {
  console.error("[OAuth] Exchanging Facebook authorization code...")

  const params = new URLSearchParams({
    client_id: appId!,
    client_secret: appSecret!,
    redirect_uri: redirectUri,
    code,
  })

  const response = await fetch(`${FACEBOOK_TOKEN_ENDPOINT}?${params}`)

  if (!response.ok) {
    const error = await response.json()
    console.error("[OAuth] Facebook token exchange failed:", error)
    throw new Error(error.error?.message || "Token exchange failed")
  }

  const tokens = (await response.json()) as {
    access_token: string
    token_type: string
    expires_in?: number
  }

  console.error("[OAuth] Got short-lived token, exchanging for long-lived token...")

  // Exchange for long-lived token
  const longLivedParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId!,
    client_secret: appSecret!,
    fb_exchange_token: tokens.access_token,
  })

  const longLivedResponse = await fetch(`${FACEBOOK_TOKEN_ENDPOINT}?${longLivedParams}`)
  const longLivedTokens = (await longLivedResponse.json()) as {
    access_token: string
    token_type: string
    expires_in?: number
  }

  const accessToken = longLivedResponse.ok ? longLivedTokens.access_token : tokens.access_token
  const expiresIn = longLivedResponse.ok ? longLivedTokens.expires_in : tokens.expires_in

  console.error("[OAuth] Fetching user info and page tokens...")

  // Get user info
  const userResponse = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`)
  const userData = (await userResponse.json()) as { id: string; name?: string }

  // Get page access tokens
  const pagesResponse = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,instagram_business_account&access_token=${accessToken}`,
  )
  const pagesData = (await pagesResponse.json()) as {
    data: Array<{
      id: string
      name: string
      category?: string
      access_token: string
      instagram_business_account?: { id: string }
    }>
  }

  const pageTokens: Record<string, PageTokenInfo> = {}
  for (const page of pagesData.data || []) {
    pageTokens[page.id] = {
      accessToken: page.access_token,
      name: page.name,
      category: page.category,
      instagramBusinessAccountId: page.instagram_business_account?.id,
    }
  }

  console.error(`[OAuth] Success! Found ${Object.keys(pageTokens).length} pages.`)

  return {
    userAccessToken: accessToken,
    userId: userData.id,
    userName: userData.name,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    pageTokens,
  }
}

// ========== OAuth HTTP Server ==========
function createOAuthServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", baseUrl)
    const method = req.method || "GET"

    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      res.end(JSON.stringify(data))
    }

    const readBody = (): Promise<string> =>
      new Promise((resolve) => {
        let body = ""
        req.on("data", (chunk) => (body += chunk))
        req.on("end", () => resolve(body))
      })

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      })
      res.end()
      return
    }

    // ===== OAuth Discovery =====
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256", "plain"],
        scopes_supported: FACEBOOK_SCOPES,
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      })
    }

    // ===== Dynamic Client Registration =====
    if (url.pathname === "/oauth/register" && method === "POST") {
      const body = JSON.parse(await readBody())
      const clientId = crypto.randomBytes(16).toString("hex")

      registeredClients.set(clientId, {
        redirectUris: body.redirect_uris || [],
        createdAt: Date.now(),
      })

      console.error(`[OAuth] Registered client: ${clientId}`)

      return json({
        client_id: clientId,
        client_secret: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        redirect_uris: body.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
      })
    }

    // ===== Authorization Endpoint =====
    if (url.pathname === "/oauth/authorize") {
      const clientId = url.searchParams.get("client_id")
      const redirectUri = url.searchParams.get("redirect_uri")
      const responseType = url.searchParams.get("response_type")
      const state = url.searchParams.get("state") || crypto.randomBytes(16).toString("hex")
      const scope = url.searchParams.get("scope")
      const codeChallenge = url.searchParams.get("code_challenge")
      const codeChallengeMethod = url.searchParams.get("code_challenge_method")

      if (!clientId || !redirectUri || responseType !== "code") {
        return json({ error: "invalid_request", error_description: "Missing required parameters" }, 400)
      }

      const txnId = crypto.randomBytes(32).toString("base64url")
      transactions.set(txnId, {
        clientId,
        redirectUri,
        state,
        codeChallenge: codeChallenge || undefined,
        codeChallengeMethod: codeChallengeMethod || undefined,
        scope: scope?.split(" ") || FACEBOOK_SCOPES,
        createdAt: Date.now(),
      })

      // Redirect to Facebook
      const facebookAuthUrl = new URL(FACEBOOK_AUTH_ENDPOINT)
      facebookAuthUrl.searchParams.set("client_id", appId!)
      facebookAuthUrl.searchParams.set("redirect_uri", `${baseUrl}/oauth/callback`)
      facebookAuthUrl.searchParams.set("state", txnId)
      facebookAuthUrl.searchParams.set("scope", FACEBOOK_SCOPES.join(","))
      facebookAuthUrl.searchParams.set("response_type", "code")

      console.error(`[OAuth] Redirecting to Facebook (transaction: ${txnId.slice(0, 8)}...)`)

      res.writeHead(302, { Location: facebookAuthUrl.toString() })
      res.end()
      return
    }

    // ===== Facebook Callback =====
    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code")
      const txnId = url.searchParams.get("state")
      const error = url.searchParams.get("error")
      const errorDesc = url.searchParams.get("error_description")

      if (error) {
        console.error(`[OAuth] Facebook error: ${error} - ${errorDesc}`)
        return json({ error, error_description: errorDesc }, 400)
      }

      if (!code || !txnId) {
        return json({ error: "invalid_request", error_description: "Missing code or state" }, 400)
      }

      const txn = transactions.get(txnId)
      if (!txn) {
        return json({ error: "invalid_request", error_description: "Invalid or expired state" }, 400)
      }

      try {
        const metaTokens = await exchangeFacebookCode(code, `${baseUrl}/oauth/callback`)

        const ourCode = crypto.randomBytes(32).toString("base64url")
        authCodes.set(ourCode, {
          clientId: txn.clientId,
          redirectUri: txn.redirectUri,
          metaTokens,
          createdAt: Date.now(),
          used: false,
        })

        transactions.delete(txnId)

        const clientRedirect = new URL(txn.redirectUri)
        clientRedirect.searchParams.set("code", ourCode)
        clientRedirect.searchParams.set("state", txn.state)

        console.error(`[OAuth] Success! Redirecting to MCP client...`)

        res.writeHead(302, { Location: clientRedirect.toString() })
        res.end()
      } catch (err) {
        console.error("[OAuth] Token exchange failed:", err)

        const clientRedirect = new URL(txn.redirectUri)
        clientRedirect.searchParams.set("error", "server_error")
        clientRedirect.searchParams.set("error_description", String(err))
        clientRedirect.searchParams.set("state", txn.state)

        res.writeHead(302, { Location: clientRedirect.toString() })
        res.end()
      }
      return
    }

    // ===== Token Endpoint =====
    if (url.pathname === "/oauth/token" && method === "POST") {
      const body = await readBody()
      const params = new URLSearchParams(body)

      const grantType = params.get("grant_type")
      const code = params.get("code")

      if (grantType === "authorization_code") {
        if (!code) {
          return json({ error: "invalid_request", error_description: "Missing code" }, 400)
        }

        const authCode = authCodes.get(code)
        if (!authCode) {
          return json({ error: "invalid_grant", error_description: "Invalid or expired code" }, 400)
        }

        if (authCode.used) {
          return json({ error: "invalid_grant", error_description: "Code already used" }, 400)
        }

        authCode.used = true
        authCodes.set(code, authCode)

        const jti = crypto.randomBytes(16).toString("hex")
        const accessToken = createJWT({ sub: jti, scope: FACEBOOK_SCOPES.join(" ") }, 3600)

        tokenStore.set(jti, { metaTokens: authCode.metaTokens, createdAt: Date.now() })

        console.error(`[OAuth] Issued access token for MCP client`)

        return json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: FACEBOOK_SCOPES.join(" "),
        })
      }

      return json({ error: "unsupported_grant_type" }, 400)
    }

    // ===== Health Check =====
    if (url.pathname === "/health") {
      return json({ status: "ok", oauth: "ready" })
    }

    json({ error: "not_found" }, 404)
  })
}

// ========== Meta Graph Client Helper ==========
function createMetaGraphClientFromSession(session: MetaSession): MetaGraphClient {
  return new MetaGraphClient({
    appId: appId!,
    appSecret: appSecret!,
    accessToken: session.userAccessToken,
    userAgent,
  })
}

// ========== FastMCP Server ==========
const server = new FastMCP<MetaSession | undefined>({
  name: "meta-graph-api-mcp-server",
  version: "1.0.0",
  instructions: `Meta Graph API MCP Server for Facebook Pages and Instagram Business.
Connect via HTTP and the server will guide you through Facebook OAuth automatically.`,

  oauth: {
    enabled: true,
    authorizationServer: {
      issuer: baseUrl,
      authorizationEndpoint: `${baseUrl}/oauth/authorize`,
      tokenEndpoint: `${baseUrl}/oauth/token`,
      responseTypesSupported: ["code"],
      codeChallengeMethodsSupported: ["S256", "plain"],
      grantTypesSupported: ["authorization_code"],
      scopesSupported: FACEBOOK_SCOPES,
      registrationEndpoint: `${baseUrl}/oauth/register`,
    },
    protectedResource: {
      resource: mcpUrl,
      authorizationServers: [baseUrl],
      scopesSupported: FACEBOOK_SCOPES,
    },
  },

  authenticate: async (request) => {
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith("Bearer ")) {
      return undefined
    }

    const token = authHeader.slice(7)
    const result = verifyJWT(token)

    if (!result.valid || !result.payload?.sub) {
      return undefined
    }

    const jti = result.payload.sub as string
    const stored = tokenStore.get(jti)

    if (!stored) {
      return undefined
    }

    return stored.metaTokens
  },
})

// ===== Connection Tools =====
server.addTool({
  name: "test_connection",
  description: "Test the Meta Graph API MCP Server connection",
  parameters: z.object({}),
  execute: async (_args, { session }) => {
    const status = session?.userAccessToken ? "Authenticated" : "Not authenticated"
    const pageCount = session?.pageTokens ? Object.keys(session.pageTokens).length : 0
    return `Meta Graph API MCP Server\n- Status: ${status}\n- User: ${session?.userName || "N/A"}\n- Pages: ${pageCount}\n- Scopes: ${FACEBOOK_SCOPES.join(", ")}`
  },
})

// ===== Page Tools =====
server.addTool({
  name: "get_my_pages",
  description: "Get all Facebook Pages you manage",
  parameters: z.object({}),
  execute: async (_args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const client = createMetaGraphClientFromSession(session)
    const pages = await client.getMyPages()
    return formatPageList(pages)
  },
})

server.addTool({
  name: "get_page",
  description: "Get details of a specific Facebook Page",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    const client = createMetaGraphClientFromSession(session)
    const page = await client.getPage(args.page_id, pageToken)
    return formatPageDetailed(page)
  },
})

// ===== Post Tools =====
server.addTool({
  name: "create_page_post",
  description: "Create a new post on a Facebook Page",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID"),
    message: z.string().optional().describe("The post message/content"),
    link: z.string().url().optional().describe("URL to share with the post"),
    published: z.boolean().default(true).describe("Whether to publish immediately"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const post = await client.createPagePost(
      args.page_id,
      {
        message: args.message,
        link: args.link,
        published: args.published,
      },
      pageToken,
    )
    return formatPostDetailed(post)
  },
})

server.addTool({
  name: "get_page_posts",
  description: "Get recent posts from a Facebook Page",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID"),
    limit: z.number().min(1).max(100).default(10).describe("Number of posts to retrieve"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const posts = await client.getPagePosts(args.page_id, pageToken, args.limit)
    return formatPostList(posts)
  },
})

server.addTool({
  name: "get_post",
  description: "Get a specific post by ID",
  parameters: z.object({
    post_id: z.string().describe("The post ID"),
    page_id: z.string().optional().describe("The Page ID (for page access token)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = args.page_id ? session.pageTokens[args.page_id]?.accessToken : undefined
    const client = createMetaGraphClientFromSession(session)
    const post = await client.getPost(args.post_id, pageToken)
    return formatPostDetailed(post)
  },
})

server.addTool({
  name: "delete_post",
  description: "Delete a post from a Facebook Page",
  parameters: z.object({
    post_id: z.string().describe("The post ID to delete"),
    page_id: z.string().describe("The Page ID (required for authentication)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    await client.deletePost(args.post_id, pageToken)
    return `Post ${args.post_id} deleted successfully.`
  },
})

// ===== Comment Tools =====
server.addTool({
  name: "get_post_comments",
  description: "Get comments on a post",
  parameters: z.object({
    post_id: z.string().describe("The post ID"),
    page_id: z.string().describe("The Page ID (for authentication)"),
    limit: z.number().min(1).max(100).default(25).describe("Number of comments to retrieve"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const comments = await client.getPostComments(args.post_id, pageToken, args.limit)
    return formatCommentList(comments)
  },
})

server.addTool({
  name: "reply_to_comment",
  description: "Reply to a comment on a post",
  parameters: z.object({
    comment_id: z.string().describe("The comment ID to reply to"),
    message: z.string().describe("The reply message"),
    page_id: z.string().describe("The Page ID (for authentication)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const reply = await client.replyToComment(args.comment_id, args.message, pageToken)
    return formatCommentDetailed(reply)
  },
})

server.addTool({
  name: "delete_comment",
  description: "Delete a comment",
  parameters: z.object({
    comment_id: z.string().describe("The comment ID to delete"),
    page_id: z.string().describe("The Page ID (for authentication)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    await client.deleteComment(args.comment_id, pageToken)
    return `Comment ${args.comment_id} deleted successfully.`
  },
})

// ===== Media Tools =====
server.addTool({
  name: "upload_photo",
  description: "Upload a photo to a Facebook Page",
  parameters: z.object({
    page_id: z.string().describe("The Page ID"),
    photo_url: z.string().url().describe("URL of the photo to upload"),
    caption: z.string().optional().describe("Caption for the photo"),
    published: z.boolean().default(true).describe("Whether to publish immediately"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const result = await client.uploadPhoto(
      args.page_id,
      {
        url: args.photo_url,
        caption: args.caption,
        published: args.published,
      },
      pageToken,
    )
    return `Photo uploaded successfully!\n- Photo ID: ${result.id}\n- Post ID: ${result.postId || "N/A"}`
  },
})

// ===== Analytics Tools =====
server.addTool({
  name: "get_page_insights",
  description: "Get analytics/insights for a Facebook Page",
  parameters: z.object({
    page_id: z.string().describe("The Page ID"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Metrics to retrieve (default: page_impressions, page_engaged_users, page_fans)"),
    period: z.enum(["day", "week", "days_28"]).default("day").describe("Time period for metrics"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const insights = await client.getPageInsights(args.page_id, pageToken, args.metrics, args.period)
    return formatPageInsights(insights)
  },
})

server.addTool({
  name: "get_post_insights",
  description: "Get analytics/insights for a specific post",
  parameters: z.object({
    post_id: z.string().describe("The post ID"),
    page_id: z.string().describe("The Page ID (for authentication)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const insights = await client.getPostInsights(args.post_id, pageToken)
    return formatPostInsights(insights)
  },
})

// ===== Instagram Tools =====
server.addTool({
  name: "get_instagram_account",
  description: "Get the Instagram Business account linked to a Facebook Page",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const account = await client.getInstagramAccount(args.page_id, pageToken)
    if (!account) return "No Instagram Business account linked to this page."
    return formatInstagramAccountDetailed(account)
  },
})

server.addTool({
  name: "get_instagram_media",
  description: "Get recent posts from an Instagram Business account",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID (for authentication)"),
    instagram_account_id: z
      .string()
      .optional()
      .describe("Instagram account ID (if not provided, will use linked account)"),
    limit: z.number().min(1).max(50).default(10).describe("Number of posts to retrieve"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)

    let igAccountId = args.instagram_account_id
    if (!igAccountId) {
      igAccountId = session.pageTokens[args.page_id]?.instagramBusinessAccountId
      if (!igAccountId) throw new Error("No Instagram account ID provided and no linked account found")
    }

    const client = createMetaGraphClientFromSession(session)
    const media = await client.getInstagramMedia(igAccountId, pageToken, args.limit)
    return formatInstagramMediaList(media)
  },
})

server.addTool({
  name: "create_instagram_post",
  description: "Create a new post on Instagram",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID (for authentication)"),
    image_url: z.string().url().describe("Public URL of the image to post"),
    caption: z.string().optional().describe("Caption for the post"),
    instagram_account_id: z
      .string()
      .optional()
      .describe("Instagram account ID (if not provided, will use linked account)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)

    let igAccountId = args.instagram_account_id
    if (!igAccountId) {
      igAccountId = session.pageTokens[args.page_id]?.instagramBusinessAccountId
      if (!igAccountId) throw new Error("No Instagram account ID provided and no linked account found")
    }

    const client = createMetaGraphClientFromSession(session)
    const media = await client.createInstagramPost(
      igAccountId,
      {
        imageUrl: args.image_url,
        caption: args.caption,
      },
      pageToken,
    )
    return formatInstagramMediaDetailed(media)
  },
})

server.addTool({
  name: "get_instagram_comments",
  description: "Get comments on an Instagram post",
  parameters: z.object({
    media_id: z.string().describe("The Instagram media ID"),
    page_id: z.string().describe("The Facebook Page ID (for authentication)"),
    limit: z.number().min(1).max(50).default(25).describe("Number of comments to retrieve"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const comments = await client.getInstagramComments(args.media_id, pageToken, args.limit)
    return formatInstagramCommentList(comments)
  },
})

server.addTool({
  name: "reply_to_instagram_comment",
  description: "Reply to a comment on an Instagram post",
  parameters: z.object({
    comment_id: z.string().describe("The comment ID to reply to"),
    message: z.string().describe("The reply message"),
    page_id: z.string().describe("The Facebook Page ID (for authentication)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)
    const client = createMetaGraphClientFromSession(session)
    const reply = await client.replyToInstagramComment(args.comment_id, args.message, pageToken)
    return `Reply posted!\n- ID: ${reply.id}\n- Text: ${reply.text}`
  },
})

server.addTool({
  name: "get_instagram_insights",
  description: "Get analytics/insights for an Instagram Business account",
  parameters: z.object({
    page_id: z.string().describe("The Facebook Page ID (for authentication)"),
    instagram_account_id: z
      .string()
      .optional()
      .describe("Instagram account ID (if not provided, will use linked account)"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Metrics to retrieve (default: impressions, reach, follower_count)"),
    period: z.enum(["day", "week", "days_28", "lifetime"]).default("day").describe("Time period for metrics"),
  }),
  execute: async (args, { session }) => {
    if (!session?.userAccessToken) throw new Error("Not authenticated")
    const pageToken = session.pageTokens[args.page_id]?.accessToken
    if (!pageToken) throw new Error(`No access token for page ${args.page_id}`)

    let igAccountId = args.instagram_account_id
    if (!igAccountId) {
      igAccountId = session.pageTokens[args.page_id]?.instagramBusinessAccountId
      if (!igAccountId) throw new Error("No Instagram account ID provided and no linked account found")
    }

    const client = createMetaGraphClientFromSession(session)
    const insights = await client.getInstagramInsights(igAccountId, pageToken, args.metrics, args.period)
    return formatInstagramInsights(insights)
  },
})

// ===== Start Server =====
async function main() {
  const useStdio = process.env.TRANSPORT_TYPE === "stdio"

  if (useStdio) {
    console.error("[Setup] Starting in stdio mode")
    await server.start({ transportType: "stdio" })
  } else {
    // Start OAuth server on main port
    const oauthServer = createOAuthServer()
    oauthServer.listen(serverPort, serverHost, () => {
      console.error(`[Setup] OAuth server ready at ${baseUrl}`)
    })

    // Start FastMCP on port + 1
    await server.start({
      transportType: "httpStream",
      httpStream: {
        port: mcpPort,
        host: serverHost,
        endpoint: "/mcp",
      },
    })

    console.error(`[Setup] MCP server ready at http://${serverHost}:${mcpPort}/mcp`)
    console.error("")
    console.error("[OAuth] Automatic OAuth flow:")
    console.error(`  1. Connect MCP client to: http://${serverHost}:${mcpPort}/mcp`)
    console.error(`  2. Discovery endpoint:    ${baseUrl}/.well-known/oauth-authorization-server`)
    console.error(`  3. The MCP client will automatically handle OAuth via browser`)
    console.error("")
    console.error("[Config] Update .mcp.json:")
    console.error(`  {`)
    console.error(`    "mcpServers": {`)
    console.error(`      "meta-graph": {`)
    console.error(`        "type": "http",`)
    console.error(`        "url": "http://${serverHost}:${mcpPort}/mcp"`)
    console.error(`      }`)
    console.error(`    }`)
    console.error(`  }`)
  }
}

process.on("SIGINT", () => process.exit(0))
process.on("SIGTERM", () => process.exit(0))

main().catch(console.error)
