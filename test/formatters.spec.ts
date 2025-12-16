import { describe, expect, it } from "vitest"

import type { FacebookPage, FacebookPost, InstagramBusinessAccount } from "../src/types"
import {
  formatInstagramAccountDetailed,
  formatPageDetailed,
  formatPageList,
  formatPostDetailed,
  formatPostList,
} from "../src/utils/formatters"

describe("formatters", () => {
  describe("formatPageDetailed", () => {
    it("should format a page with all fields", () => {
      const page: FacebookPage = {
        id: "123456789",
        name: "Test Page",
        category: "Business",
        about: "This is a test page",
        fanCount: 10000,
        followerCount: 9500,
        website: "https://example.com",
        instagramBusinessAccount: { id: "ig123" },
      }

      const result = formatPageDetailed(page)

      expect(result).toContain("# Test Page")
      expect(result).toContain("**ID**: 123456789")
      expect(result).toContain("**Category**: Business")
      expect(result).toContain("**Fans**: 10,000")
      expect(result).toContain("**Followers**: 9,500")
      expect(result).toContain("**Website**: https://example.com")
      expect(result).toContain("**Connected Account ID**: ig123")
    })

    it("should handle missing optional fields", () => {
      const page: FacebookPage = {
        id: "123",
        name: "Minimal Page",
      }

      const result = formatPageDetailed(page)

      expect(result).toContain("# Minimal Page")
      expect(result).toContain("**Category**: N/A")
      expect(result).toContain("**Fans**: N/A")
    })
  })

  describe("formatPageList", () => {
    it("should format empty list", () => {
      const result = formatPageList([])
      expect(result).toBe("No pages found.")
    })

    it("should format multiple pages", () => {
      const pages: FacebookPage[] = [
        { id: "1", name: "Page One", category: "Business", fanCount: 100 },
        { id: "2", name: "Page Two", category: "Entertainment", fanCount: 200 },
      ]

      const result = formatPageList(pages)

      expect(result).toContain("# Your Facebook Pages (2)")
      expect(result).toContain("## 1. Page One")
      expect(result).toContain("## 2. Page Two")
    })
  })

  describe("formatPostDetailed", () => {
    it("should format a post with engagement", () => {
      const post: FacebookPost = {
        id: "post123",
        message: "Hello world!",
        createdTime: "2024-01-15T10:00:00Z",
        permalinkUrl: "https://facebook.com/post/123",
        reactions: { summary: { total_count: 50 } },
        comments: { summary: { total_count: 10 } },
        shares: { count: 5 },
        isPublished: true,
      }

      const result = formatPostDetailed(post)

      expect(result).toContain("# Facebook Post")
      expect(result).toContain("**ID**: post123")
      expect(result).toContain("Hello world!")
      expect(result).toContain("**Reactions**: 50")
      expect(result).toContain("**Comments**: 10")
      expect(result).toContain("**Shares**: 5")
    })
  })

  describe("formatPostList", () => {
    it("should format empty list", () => {
      const result = formatPostList([])
      expect(result).toBe("No posts found.")
    })
  })

  describe("formatInstagramAccountDetailed", () => {
    it("should format an Instagram account", () => {
      const account: InstagramBusinessAccount = {
        id: "ig123",
        username: "testaccount",
        name: "Test Account",
        followersCount: 5000,
        followsCount: 100,
        mediaCount: 50,
        biography: "Test bio",
      }

      const result = formatInstagramAccountDetailed(account)

      expect(result).toContain("# Instagram Business Account")
      expect(result).toContain("**Username**: @testaccount")
      expect(result).toContain("**Followers**: 5,000")
      expect(result).toContain("Test bio")
    })
  })
})
