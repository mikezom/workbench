import { describe, it, expect, beforeEach } from "vitest";
import {
  createClipboardItem,
  getAllClipboardItems,
  getClipboardItem,
  updateClipboardItem,
  deleteClipboardItem,
} from "./clipboard-db";
import { getDb } from "./db";

describe("clipboard-db", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM clipboard_items");
  });
  describe("createClipboardItem", () => {
    it("should create a clipboard item with content", () => {
      const item = createClipboardItem({
        content: "console.log('hello world');",
        language: "javascript",
      });

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.content).toBe("console.log('hello world');");
      expect(item.language).toBe("javascript");
      expect(item.created_at).toBeDefined();
    });

    it("should create a clipboard item without language", () => {
      const item = createClipboardItem({
        content: "plain text snippet",
      });

      expect(item).toBeDefined();
      expect(item.content).toBe("plain text snippet");
      expect(item.language).toBeNull();
    });
  });

  describe("getAllClipboardItems", () => {
    it("should return all clipboard items", () => {
      createClipboardItem({ content: "snippet 1" });
      createClipboardItem({ content: "snippet 2" });

      const items = getAllClipboardItems();
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getClipboardItem", () => {
    it("should retrieve a clipboard item by id", () => {
      const created = createClipboardItem({ content: "test snippet" });
      const retrieved = getClipboardItem(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.content).toBe("test snippet");
    });

    it("should return undefined for non-existent id", () => {
      const item = getClipboardItem("non-existent-id");
      expect(item).toBeUndefined();
    });
  });

  describe("updateClipboardItem", () => {
    it("should update clipboard item content", () => {
      const created = createClipboardItem({ content: "original" });
      const updated = updateClipboardItem(created.id, {
        content: "updated content",
      });

      expect(updated).toBeDefined();
      expect(updated?.content).toBe("updated content");
    });

    it("should return null for non-existent id", () => {
      const result = updateClipboardItem("non-existent-id", {
        content: "test",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteClipboardItem", () => {
    it("should delete a clipboard item", () => {
      const created = createClipboardItem({ content: "to delete" });
      const deleted = deleteClipboardItem(created.id);

      expect(deleted).toBe(true);

      const retrieved = getClipboardItem(created.id);
      expect(retrieved).toBeUndefined();
    });

    it("should return false for non-existent id", () => {
      const result = deleteClipboardItem("non-existent-id");
      expect(result).toBe(false);
    });
  });
});
