# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Model Context Protocol (MCP) server that provides comprehensive Meta Graph API integration including Facebook Pages, Instagram Business, content management, and analytics. Built with FastMCP and supports dual transport modes (stdio for Claude Desktop/Cursor, HTTP for remote access).

## Development Commands

### Essential Commands

- `pnpm validate` - **Pre-checkin**: Format, lint, test, and build everything
- `pnpm dev` - Build with watch mode for active development
- `pnpm serve:dev` - Run server with hot reload using tsx

### Testing

- `pnpm test` - Run all tests
- `pnpm test:watch` - Watch mode for TDD
- `pnpm test:coverage` - Generate coverage report

### Server Operation

- `pnpm start` - Build and run production server
- `pnpm serve` - Run built server without rebuild
- `pnpm inspect` - Launch MCP inspector for debugging tools

### CLI Testing

```bash
# Test with environment variables
FACEBOOK_APP_ID=xxx FACEBOOK_APP_SECRET=yyy pnpm serve:dev

# Test CLI flags
pnpm build && node dist/bin.cjs --help
```

## Architecture

### Single-Client Design (vs LinkedIn's Dual-Client)

Unlike LinkedIn which requires separate clients for Personal and Marketing APIs, Facebook uses a **unified Graph API**. All features (pages, posts, insights, Instagram) operate through a single `MetaGraphClient`:

```
MetaGraphClient
├── Page Management (getMyPages, getPage)
├── Post Management (createPagePost, getPagePosts, getPost, deletePost)
├── Comments (getPostComments, replyToComment, deleteComment)
├── Media Upload (uploadPhoto)
├── Page Insights (getPageInsights, getPostInsights)
└── Instagram Business (getInstagramAccount, createInstagramPost, etc.)
```

### MCP Server Structure

The main server (`src/index.ts`) follows FastMCP patterns:

- **Setup Phase**: `setupMetaGraphClient()` initializes client with session tokens
- **Tool Registration**: 20 tools registered with Zod schema validation
- **Transport Selection**: Environment variable `TRANSPORT_TYPE` controls stdio vs HTTP mode
- **OAuth Proxy**: FastMCP handles OAuth flow, issuing JWTs that map to Facebook tokens

### Meta Graph API Specifics

**Authentication Flow**:

1. User authorizes via Facebook OAuth
2. Server receives authorization code
3. Code exchanged for short-lived token
4. Short-lived token exchanged for long-lived token (60 days)
5. Server fetches page access tokens via `/me/accounts`
6. FastMCP issues JWT mapping to Facebook tokens

**Graph API Version**: v21.0

**API Response Format**: Facebook API returns snake_case, transformed to camelCase in types:

```typescript
// Raw API response (snake_case)
type RawInsightMetric = {
  end_time: string
  // ...
}

// Internal type (camelCase)
type InsightMetric = {
  endTime: string
  // ...
}
```

### Type System Architecture

Types in `src/types.ts` are organized by domain:

- **Session**: MetaSession with user tokens and page tokens map
- **Pages**: FacebookPage with optional Instagram connection
- **Posts**: FacebookPost with engagement summaries
- **Comments**: FacebookComment, InstagramComment
- **Instagram**: InstagramBusinessAccount, InstagramMedia
- **Insights**: PageInsights, PostInsights, InstagramInsights

**Important**: Formatters (`src/utils/formatters.ts`) convert API responses to user-friendly markdown strings. All MCP tools return formatted strings, not raw objects.

### Build System (ts-builds)

Unlike LinkedIn's tsup setup, this project uses ts-builds + tsdown:

- **Scripts**: Delegate to ts-builds commands (`pnpm validate` → `ts-builds validate`)
- **Output**: `.cjs`, `.mjs`, `.d.mts` (not `.js`, `.d.ts`)
- **Config**: `tsdown.config.ts` imports from `ts-builds/tsdown`
- **TypeScript**: `tsconfig.json` extends `ts-builds/tsconfig`

## Meta Graph API Requirements

### Required OAuth Scopes

**Pages**:

- `pages_show_list` - List managed pages
- `pages_read_engagement` - Read posts, followers, metadata
- `pages_manage_posts` - Create/edit/delete posts
- `pages_read_user_content` - Read user comments on page
- `pages_manage_engagement` - Reply to/delete comments
- `read_insights` - Page and post analytics

**Instagram**:

- `instagram_basic` - Read Instagram profile and media
- `instagram_content_publish` - Create organic posts
- `instagram_manage_comments` - Manage comments
- `instagram_manage_insights` - Get Instagram insights

### Rate Limits

- Standard access: Varies by endpoint
- Page insights: 200 calls per hour
- Post creation: Based on app tier

### Environment Variables

**Required**:

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`

**Server Config**:

- `TRANSPORT_TYPE`: `stdio` (Claude Desktop/Cursor) or `http` (default)
- `PORT`: HTTP server port (default: 3000)
- `HOST`: Bind address (default: localhost)
- `BASE_URL`: Public URL for OAuth callbacks (default: `http://localhost:PORT`)

## Testing Strategy

- Tests use Vitest with Node.js environment
- Focus on formatters and type transformations (API calls require live credentials)
- Test files in `test/*.spec.ts`

## Common Patterns

### Adding a New MCP Tool

1. Define parameter schema with Zod in `src/index.ts`
2. Get client via `context.session` tokens
3. Initialize client and call method
4. Format response using utilities from `src/utils/formatters.ts`
5. Return formatted string for user display

### Handling API Response Transformation

Facebook API uses snake_case; internal types use camelCase:

```typescript
// Transform in client method
return {
  pageId,
  metrics: (response.data || []).map((m) => ({
    name: m.name,
    values: m.values.map((v) => ({ value: v.value, endTime: v.end_time })),
  })),
}
```

### Transport Mode Considerations

- **stdio mode**: Single request/response, for Claude Desktop/Cursor
- **HTTP mode**: Supports SSE streaming at `/sse` endpoint
- Authentication handled by FastMCP's OAuth proxy in both modes

## Key Differences from LinkedIn MCP

| Aspect        | LinkedIn                   | Meta Graph               |
| ------------- | -------------------------- | ------------------------ |
| Clients       | 2 (Personal + Marketing)   | 1 (Unified)              |
| API Protocol  | RESTli                     | Standard REST            |
| Entity IDs    | URNs (`urn:li:person:xxx`) | Simple IDs               |
| Build System  | tsup                       | ts-builds + tsdown       |
| Output Format | `.js`, `.d.ts`             | `.cjs`, `.mjs`, `.d.mts` |
