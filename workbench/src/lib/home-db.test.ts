import { describe, it, expect, beforeEach } from "vitest";
import {
  createHomePost,
  getAllHomePosts,
  getHomePost,
  updateHomePost,
  deleteHomePost,
} from "./home-db";
import { getDb } from "./db";

describe("home-db", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM home_posts");
  });

  describe("createHomePost", () => {
    it("creates a text-only post", () => {
      const post = createHomePost({
        content: "Hello world",
      });

      expect(post.id).toBeDefined();
      expect(post.content).toBe("Hello world");
      expect(post.image_url).toBeNull();
      expect(post.created_at).toBeDefined();
    });

    it("creates a post with image", () => {
      const post = createHomePost({
        content: "Check out this image",
        image_url: "https://example.com/image.jpg",
      });

      expect(post.id).toBeDefined();
      expect(post.content).toBe("Check out this image");
      expect(post.image_url).toBe("https://example.com/image.jpg");
      expect(post.created_at).toBeDefined();
    });
  });

  describe("getAllHomePosts", () => {
    it("returns empty array when no posts exist", () => {
      const posts = getAllHomePosts();
      expect(posts).toEqual([]);
    });

    it("returns all posts ordered by created_at DESC", () => {
      const post1 = createHomePost({ content: "First post" });
      const post2 = createHomePost({ content: "Second post" });
      const post3 = createHomePost({ content: "Third post" });

      const posts = getAllHomePosts();
      expect(posts).toHaveLength(3);
      expect(posts[0].id).toBe(post3.id);
      expect(posts[1].id).toBe(post2.id);
      expect(posts[2].id).toBe(post1.id);
    });
  });

  describe("getHomePost", () => {
    it("returns undefined for non-existent post", () => {
      const post = getHomePost("non-existent-id");
      expect(post).toBeUndefined();
    });

    it("returns the post by id", () => {
      const created = createHomePost({ content: "Test post" });
      const retrieved = getHomePost(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.content).toBe("Test post");
    });
  });

  describe("updateHomePost", () => {
    it("returns null for non-existent post", () => {
      const result = updateHomePost("non-existent-id", { content: "Updated" });
      expect(result).toBeNull();
    });

    it("updates content only", () => {
      const post = createHomePost({ content: "Original", image_url: "https://example.com/img.jpg" });
      const updated = updateHomePost(post.id, { content: "Updated content" });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe("Updated content");
      expect(updated!.image_url).toBe("https://example.com/img.jpg");
    });

    it("updates image_url only", () => {
      const post = createHomePost({ content: "Test", image_url: "https://example.com/old.jpg" });
      const updated = updateHomePost(post.id, { image_url: "https://example.com/new.jpg" });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe("Test");
      expect(updated!.image_url).toBe("https://example.com/new.jpg");
    });

    it("removes image by setting to null", () => {
      const post = createHomePost({ content: "Test", image_url: "https://example.com/img.jpg" });
      const updated = updateHomePost(post.id, { image_url: null });

      expect(updated).toBeDefined();
      expect(updated!.image_url).toBeNull();
    });
  });

  describe("deleteHomePost", () => {
    it("returns false for non-existent post", () => {
      const result = deleteHomePost("non-existent-id");
      expect(result).toBe(false);
    });

    it("deletes the post and returns true", () => {
      const post = createHomePost({ content: "To be deleted" });
      const result = deleteHomePost(post.id);

      expect(result).toBe(true);
      expect(getHomePost(post.id)).toBeUndefined();
    });
  });
});
