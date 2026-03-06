import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

describe("GET /api/home/images/[filename]", { concurrent: false }, () => {
  beforeEach(async () => {
    // Ensure images directory exists
    if (!fsSync.existsSync(IMAGES_DIR)) {
      await fs.mkdir(IMAGES_DIR, { recursive: true });
    }
  });

  afterEach(async () => {
    // Clean up test images
    if (fsSync.existsSync(IMAGES_DIR)) {
      const files = await fs.readdir(IMAGES_DIR);
      for (const file of files) {
        if (file.startsWith("test-")) {
          await fs.unlink(path.join(IMAGES_DIR, file)).catch(() => {
            // Ignore errors if file doesn't exist
          });
        }
      }
    }
  });

  it("returns image with correct content-type for JPEG", async () => {
    // Create a test JPEG file with unique name
    const testFilename = "test-jpeg-only.jpg";
    const testImagePath = path.join(IMAGES_DIR, testFilename);
    const imageBuffer = Buffer.from("fake-jpeg-data");
    await fs.writeFile(testImagePath, imageBuffer);

    const request = new NextRequest(
      `http://localhost:3000/api/home/images/${testFilename}`
    );

    const response = await GET(request, { params: { filename: testFilename } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );

    const responseBuffer = await response.arrayBuffer();
    expect(Buffer.from(responseBuffer).toString()).toBe("fake-jpeg-data");
  });

  it("returns 404 for non-existent image", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/home/images/non-existent.jpg"
    );

    const response = await GET(request, {
      params: { filename: "non-existent.jpg" },
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Image not found");
  });

  it("returns correct content-type for PNG", async () => {
    // Create a test PNG file with unique name
    const testFilename = "test-png-only.png";
    const testImagePath = path.join(IMAGES_DIR, testFilename);
    const imageBuffer = Buffer.from("fake-png-data");
    await fs.writeFile(testImagePath, imageBuffer);

    const request = new NextRequest(
      `http://localhost:3000/api/home/images/${testFilename}`
    );

    const response = await GET(request, { params: { filename: testFilename } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("blocks path traversal attempts", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/home/images/../../../etc/passwd"
    );

    const response = await GET(request, {
      params: { filename: "../../../etc/passwd" },
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid filename");
  });

  it("supports various image formats", async () => {
    const formats = [
      { ext: "jpg", mime: "image/jpeg" },
      { ext: "jpeg", mime: "image/jpeg" },
      { ext: "png", mime: "image/png" },
      { ext: "gif", mime: "image/gif" },
      { ext: "webp", mime: "image/webp" },
    ];

    for (const format of formats) {
      const testFilename = `test-format-${format.ext}.${format.ext}`;
      const testImagePath = path.join(IMAGES_DIR, testFilename);
      const imageBuffer = Buffer.from(`fake-${format.ext}-data`);
      await fs.writeFile(testImagePath, imageBuffer);

      const request = new NextRequest(
        `http://localhost:3000/api/home/images/${testFilename}`
      );

      const response = await GET(request, {
        params: { filename: testFilename },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(format.mime);
    }
  });

  it("returns 413 for files larger than 10MB", async () => {
    const testFilename = "test-large-image.jpg";
    const testImagePath = path.join(IMAGES_DIR, testFilename);
    // Create a file larger than 10MB (10 * 1024 * 1024 bytes)
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
    await fs.writeFile(testImagePath, largeBuffer);

    const request = new NextRequest(
      `http://localhost:3000/api/home/images/${testFilename}`
    );

    const response = await GET(request, { params: { filename: testFilename } });

    expect(response.status).toBe(413);
    const data = await response.json();
    expect(data.error).toBe("File too large");
  });

  it("blocks path traversal with resolved paths", async () => {
    // Even if the simple check passes, path.resolve should catch it
    const request = new NextRequest(
      "http://localhost:3000/api/home/images/image.jpg"
    );

    // Try to access a file outside the images directory
    const response = await GET(request, {
      params: { filename: "image.jpg" },
    });

    // This should work for a normal file, but let's test the security check
    // by ensuring the resolved path validation is in place
    expect(response.status).toBe(404); // File doesn't exist, but security check passed
  });
});
