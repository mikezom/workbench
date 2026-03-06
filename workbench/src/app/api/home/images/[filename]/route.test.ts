import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

describe("GET /api/home/images/[filename]", () => {
  beforeEach(() => {
    // Ensure images directory exists
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test images
    if (fs.existsSync(IMAGES_DIR)) {
      const files = fs.readdirSync(IMAGES_DIR);
      files.forEach((file) => {
        if (file.startsWith("test-")) {
          fs.unlinkSync(path.join(IMAGES_DIR, file));
        }
      });
    }
  });

  it("returns image with correct content-type for JPEG", async () => {
    // Create a test JPEG file
    const testFilename = "test-image.jpg";
    const testImagePath = path.join(IMAGES_DIR, testFilename);
    const imageBuffer = Buffer.from("fake-jpeg-data");
    fs.writeFileSync(testImagePath, imageBuffer);

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
    // Create a test PNG file
    const testFilename = "test-image.png";
    const testImagePath = path.join(IMAGES_DIR, testFilename);
    const imageBuffer = Buffer.from("fake-png-data");
    fs.writeFileSync(testImagePath, imageBuffer);

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
      const testFilename = `test-image.${format.ext}`;
      const testImagePath = path.join(IMAGES_DIR, testFilename);
      const imageBuffer = Buffer.from(`fake-${format.ext}-data`);
      fs.writeFileSync(testImagePath, imageBuffer);

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
});
