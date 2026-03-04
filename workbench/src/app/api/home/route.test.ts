import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";

describe("GET /api/home", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM home_posts");
  });

  it("returns empty array when no posts exist", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns all posts", async () => {
    const db = getDb();
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO home_posts (id, content, image_url, created_at) VALUES (?, ?, ?, ?)"
    ).run(id1, "Post 1", null, now);
    db.prepare(
      "INSERT INTO home_posts (id, content, image_url, created_at) VALUES (?, ?, ?, ?)"
    ).run(id2, "Post 2", "https://example.com/img.jpg", now);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
  });
});

describe("POST /api/home", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM home_posts");
  });

  it("returns 400 when content is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/home", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 when content is empty", async () => {
    const req = new NextRequest("http://localhost:3000/api/home", {
      method: "POST",
      body: JSON.stringify({ content: "   " }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("creates a text-only post", async () => {
    const req = new NextRequest("http://localhost:3000/api/home", {
      method: "POST",
      body: JSON.stringify({ content: "Hello world" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.content).toBe("Hello world");
    expect(data.image_url).toBeNull();
  });

  it("creates a post with image", async () => {
    const req = new NextRequest("http://localhost:3000/api/home", {
      method: "POST",
      body: JSON.stringify({
        content: "Check this out",
        image_url: "https://example.com/image.jpg",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.content).toBe("Check this out");
    expect(data.image_url).toBe("https://example.com/image.jpg");
  });
});
