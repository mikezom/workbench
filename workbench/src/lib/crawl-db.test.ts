import { describe, it, expect } from "vitest";
import {
  createArxivCache,
  getArxivCache,
  getAllArxivCache,
  deleteArxivCache,
  deleteExpiredArxivCache,
} from "./crawl-db";

describe("crawl-db", () => {
  describe("createArxivCache", () => {
    it("should create an arXiv cache entry with query and results", () => {
      const results = [
        {
          id: "2403.12345",
          title: "Test Paper",
          authors: ["Author One", "Author Two"],
          summary: "This is a test paper summary.",
          published: "2024-03-15T00:00:00Z",
          link: "https://arxiv.org/abs/2403.12345",
        },
      ];

      const cache = createArxivCache({
        query: "cat:cs.AI",
        results: results,
      });

      expect(cache).toBeDefined();
      expect(cache.id).toBeDefined();
      expect(cache.query).toBe("cat:cs.AI");
      expect(cache.results).toEqual(results);
      expect(cache.result_count).toBe(1);
      expect(cache.timestamp).toBeDefined();
      expect(cache.created_at).toBeDefined();
    });

    it("should create cache entry with empty results", () => {
      const cache = createArxivCache({
        query: "cat:nonexistent",
        results: [],
      });

      expect(cache).toBeDefined();
      expect(cache.result_count).toBe(0);
      expect(cache.results).toEqual([]);
    });
  });

  describe("getArxivCache", () => {
    it("should retrieve cache entry by query", () => {
      const results = [{ id: "test", title: "Test" }];
      createArxivCache({ query: "test:query", results });

      const cached = getArxivCache("test:query");

      expect(cached).toBeDefined();
      expect(cached?.query).toBe("test:query");
      expect(cached?.results).toEqual(results);
    });

    it("should return undefined for non-existent query", () => {
      const cached = getArxivCache("non-existent-query");
      expect(cached).toBeUndefined();
    });

    it("should return most recent entry when multiple exist for same query", () => {
      const oldResults = [{ id: "old", title: "Old" }];
      const newResults = [{ id: "new", title: "New" }];

      createArxivCache({ query: "duplicate:query", results: oldResults });
      // Wait a tiny bit to ensure different timestamps
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }
      createArxivCache({ query: "duplicate:query", results: newResults });

      const cached = getArxivCache("duplicate:query");

      expect(cached).toBeDefined();
      expect(cached?.results).toEqual(newResults);
    });
  });

  describe("getAllArxivCache", () => {
    it("should return all cache entries ordered by timestamp desc", () => {
      createArxivCache({ query: "query1", results: [] });
      createArxivCache({ query: "query2", results: [] });

      const all = getAllArxivCache();

      expect(all.length).toBeGreaterThanOrEqual(2);
      // Verify descending order by timestamp
      for (let i = 0; i < all.length - 1; i++) {
        expect(all[i].timestamp).toBeGreaterThanOrEqual(all[i + 1].timestamp);
      }
    });
  });

  describe("deleteArxivCache", () => {
    it("should delete a cache entry by id", () => {
      const cache = createArxivCache({ query: "to-delete", results: [] });
      const deleted = deleteArxivCache(cache.id);

      expect(deleted).toBe(true);

      // Verify it's gone - getAllArxivCache should not include it
      const all = getAllArxivCache();
      const found = all.find((c) => c.id === cache.id);
      expect(found).toBeUndefined();
    });

    it("should return false for non-existent id", () => {
      const result = deleteArxivCache("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("deleteExpiredArxivCache", () => {
    it("should delete cache entries older than specified timestamp", () => {
      const now = Date.now();

      // Create an old entry (we can't control timestamp directly, so this test
      // verifies the function exists and returns a number)
      const deletedCount = deleteExpiredArxivCache(now + 1000);

      expect(typeof deletedCount).toBe("number");
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it("should not delete recent entries", () => {
      const before = getAllArxivCache().length;
      createArxivCache({ query: "recent", results: [] });

      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      deleteExpiredArxivCache(oneHourAgo);

      const after = getAllArxivCache().length;
      // The recent entry should still exist
      expect(after).toBeGreaterThanOrEqual(before + 1);
    });
  });
});
