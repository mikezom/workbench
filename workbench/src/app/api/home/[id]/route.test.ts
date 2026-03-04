import { describe, it, expect, beforeEach } from "vitest";
import { GET, PUT, DELETE } from "./route";
import { createHomePost } from "@/lib/home-db";
import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";

describe("GET /api/home/[id]", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM home_posts");
  });

  it("returns 404 for non-existent post", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/home/non-existent"),
      { params: Promise.resolve({ id: "non-existent" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns the post by id", async () => {
    const post = createHomePost({ content: "Test post" });

    const response = await GET(
      new NextRequest(`http://localhost:3000/api/home/${post.id}`),
      { params: Promise.resolve({ id: post.id }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(post.id);
    expect(data.content).toBe("Test post");
  });
});

describe("PUT /api/home/[id]", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM home_posts");
  });

  it("returns 404 for non-existent post", async () => {
    const req = new NextRequest("http://localhost:3000/api/home/non-existent", {
      method: "PUT",
      body: JSON.stringify({ content: "Updated" }),
    });

    const response = await PUT(req, { params: Promise.resolve({ id: "non-existent" }) });

    expect(response.status).toBe(404);
  });

  it("updates the post", async () => {
    const post = createHomePost({ content: "Original" });

    const req = new NextRequest(`http://localhost:3000/api/home/${post.id}`, {
      method: "PUT",
      body: JSON.stringify({ content: "Updated content" }),
    });

    const response = await PUT(req, { params: Promise.resolve({ id: post.id }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(post.id);
    expect(data.content).toBe("Updated content");
  });
});

describe("DELETE /api/home/[id]", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM home_posts");
  });

  it("returns 404 for non-existent post", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/home/non-existent"),
      { params: Promise.resolve({ id: "non-existent" }) }
    );

    expect(response.status).toBe(404);
  });

  it("deletes the post", async () => {
    const post = createHomePost({ content: "To be deleted" });

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/home/${post.id}`),
      { params: Promise.resolve({ id: post.id }) }
    );

    expect(response.status).toBe(204);
  });
});
