# Meta Graph API MCP Server

A Model Context Protocol (MCP) server for Meta Graph API - Facebook Pages, Instagram Business, content management, and analytics.

## Features

- **Facebook Pages**: List pages, create/manage posts, moderate comments
- **Instagram Business**: Manage connected Instagram accounts, create posts, view insights
- **Analytics**: Page insights, post engagement metrics, Instagram statistics
- **Media Upload**: Upload photos to Facebook and Instagram
- **OAuth 2.0**: Automatic token exchange and long-lived token management

## Quick Start

### 1. Create a Meta Developer App

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Click **Create App** and select **Business** app type
3. Add the **Facebook Login** product
4. Configure OAuth redirect URI: `http://localhost:3000/oauth/callback`
5. Note your **App ID** and **App Secret**

### 2. Configure Permissions

In your app's App Review section, request these permissions (all available with Standard access):

**Pages:**

- `pages_show_list` - List managed pages
- `pages_read_engagement` - Read posts, followers, metadata
- `pages_manage_posts` - Create/edit/delete posts
- `pages_read_user_content` - Read user comments on page
- `pages_manage_engagement` - Reply to/delete comments
- `read_insights` - Page and post analytics

**Instagram:**

- `instagram_basic` - Read Instagram profile and media
- `instagram_content_publish` - Create organic posts
- `instagram_manage_comments` - Manage comments
- `instagram_manage_insights` - Get Instagram insights

### 3. Install and Configure

```bash
# Clone the repository
git clone https://github.com/jordanburke/meta-graph-api-mcp-server.git
cd meta-graph-api-mcp-server

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

### 4. Environment Variables

```bash
# Required
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret

# Server Configuration
TRANSPORT_TYPE=http    # "http" for web/remote, "stdio" for Claude Desktop
PORT=3000
HOST=localhost
BASE_URL=http://localhost:3000
```

### 5. Run the Server

```bash
# Development (hot reload)
pnpm serve:dev

# Production
pnpm start
```

## MCP Tools (20 total)

### Connection & Pages

| Tool              | Description                     |
| ----------------- | ------------------------------- |
| `test_connection` | Test server connection          |
| `get_my_pages`    | List all managed Facebook pages |
| `get_page`        | Get detailed page information   |

### Posts

| Tool               | Description                               |
| ------------------ | ----------------------------------------- |
| `create_page_post` | Create a post (text, link, or with photo) |
| `get_page_posts`   | List recent posts from a page             |
| `get_post`         | Get a single post with engagement         |
| `delete_post`      | Delete a post                             |

### Comments

| Tool                | Description             |
| ------------------- | ----------------------- |
| `get_post_comments` | List comments on a post |
| `reply_to_comment`  | Reply to a comment      |
| `delete_comment`    | Delete a comment        |

### Media

| Tool           | Description         |
| -------------- | ------------------- |
| `upload_photo` | Upload photo by URL |

### Analytics

| Tool                | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `get_page_insights` | Page-level analytics (impressions, engagement, fans) |
| `get_post_insights` | Post engagement metrics                              |

### Instagram Business

| Tool                         | Description                             |
| ---------------------------- | --------------------------------------- |
| `get_instagram_account`      | Get linked Instagram Business account   |
| `get_instagram_media`        | List Instagram posts                    |
| `create_instagram_post`      | Create Instagram post (image + caption) |
| `get_instagram_comments`     | List comments on Instagram media        |
| `reply_to_instagram_comment` | Reply to Instagram comment              |
| `get_instagram_insights`     | Instagram account analytics             |

## Claude Desktop / Claude Code Configuration

### Option 1: npx (Recommended)

No installation required - runs directly from npm:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "meta-graph-api": {
      "command": "npx",
      "args": ["-y", "meta-graph-api-mcp-server"],
      "env": {
        "FACEBOOK_APP_ID": "your_app_id",
        "FACEBOOK_APP_SECRET": "your_app_secret",
        "TRANSPORT_TYPE": "stdio"
      }
    }
  }
}
```

**Claude Code** (`.mcp.json` in your project):

```json
{
  "mcpServers": {
    "meta-graph": {
      "command": "npx",
      "args": ["-y", "meta-graph-api-mcp-server"],
      "env": {
        "FACEBOOK_APP_ID": "your_app_id",
        "FACEBOOK_APP_SECRET": "your_app_secret",
        "TRANSPORT_TYPE": "stdio"
      }
    }
  }
}
```

### Option 2: HTTP Mode (For Development)

Run the server separately and connect via HTTP. Useful when developing or debugging:

1. Start the server:

```bash
FACEBOOK_APP_ID=xxx FACEBOOK_APP_SECRET=yyy pnpm serve:dev
```

2. Configure MCP to connect:

```json
{
  "mcpServers": {
    "meta-graph": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Option 3: Local Installation

If you prefer a local installation:

```json
{
  "mcpServers": {
    "meta-graph-api": {
      "command": "node",
      "args": ["/path/to/meta-graph-api-mcp-server/dist/bin.cjs"],
      "env": {
        "FACEBOOK_APP_ID": "your_app_id",
        "FACEBOOK_APP_SECRET": "your_app_secret",
        "TRANSPORT_TYPE": "stdio"
      }
    }
  }
}
```

## Authentication Flow

The server implements a full OAuth 2.0 flow:

1. **Authorization**: User visits `/oauth/authorize` and authenticates with Facebook
2. **Code Exchange**: Server exchanges authorization code for short-lived token
3. **Token Extension**: Short-lived token exchanged for long-lived token (60 days)
4. **Page Tokens**: Server fetches page access tokens via `/me/accounts`
5. **Session Management**: FastMCP issues JWTs that map to Facebook tokens

## Development Commands

```bash
# Pre-checkin (format, lint, test, build)
pnpm validate

# Individual commands
pnpm format        # Format code
pnpm lint          # Fix lint issues
pnpm test          # Run tests
pnpm build         # Production build
pnpm dev           # Watch mode

# Server
pnpm start         # Build and run
pnpm serve         # Run built server
pnpm serve:dev     # Hot reload development
pnpm inspect       # MCP inspector for debugging
```

## Project Structure

```
src/
├── index.ts                    # MCP server with OAuth proxy
├── bin.ts                      # CLI entry point
├── types.ts                    # Type definitions
├── client/
│   └── meta-graph-client.ts    # Meta Graph API client
└── utils/
    └── formatters.ts           # Markdown formatters
test/
└── formatters.spec.ts          # Formatter tests
```

## API Reference

### Graph API Version

The server uses Meta Graph API **v21.0**.

### Rate Limits

- Standard access: Varies by endpoint
- Page insights: 200 calls per hour
- Post creation: Based on app tier

### Error Handling

All errors return descriptive messages:

```
Meta API Error [190]: Invalid OAuth access token
Meta API Error [100]: (#100) Pages Public Content Access requires...
```

## Troubleshooting

### "Invalid OAuth access token"

- Token may have expired (long-lived tokens last 60 days)
- Re-authenticate through the OAuth flow

### "Pages Public Content Access requires..."

- Your app needs App Review for public page access
- For testing, add yourself as a tester/admin on the app

### Instagram account not found

- Ensure the Facebook Page has a connected Instagram Business Account
- Instagram must be a Business or Creator account (not Personal)

## License

MIT

## Related Projects

- [linkedin-api-mcp-server](https://github.com/jordanburke/linkedin-api-mcp-server) - LinkedIn API MCP server
