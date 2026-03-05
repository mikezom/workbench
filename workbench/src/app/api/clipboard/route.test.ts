import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

describe("clipboard API routes", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM clipboard_items");
  });

  describe("GET /api/clipboard", () => {
    it("should return all clipboard items", async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("POST /api/clipboard", () => {
    it("should create a new clipboard item", async () => {
      const request = new NextRequest("http://localhost:3000/api/clipboard", {
        method: "POST",
        body: JSON.stringify({
          content: "test snippet",
          language: "typescript",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.content).toBe("test snippet");
      expect(data.language).toBe("typescript");
    });

    it("should return 400 if content is missing", async () => {
      const request = new NextRequest("http://localhost:3000/api/clipboard", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
