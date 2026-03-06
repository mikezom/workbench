import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "..", "..", "shared-data", "images");

describe("POST /api/home/upload", () => {
  beforeEach(() => {
    // Clean up only upload test files before each test
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      files.forEach((file) => {
        // Only delete files that don't start with "test-" (which are from other tests)
        if (!file.startsWith("test-")) {
          fs.unlinkSync(path.join(UPLOADS_DIR, file));
        }
      });
    }
  });

  afterEach(() => {
    // Clean up only upload test files after each test
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      files.forEach((file) => {
        // Only delete files that don't start with "test-" (which are from other tests)
        if (!file.startsWith("test-")) {
          fs.unlinkSync(path.join(UPLOADS_DIR, file));
        }
      });
    }
  });

  it("uploads an image file and returns the URL", async () => {
    // Create a mock image file with valid JPEG magic bytes
    const imageBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from("fake-image-data")
    ]);
    const file = new File([imageBuffer], "test-image.jpg", {
      type: "image/jpeg",
    });

    const formData = new FormData();
    formData.append("image", file);

    const request = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
    expect(data.url).toMatch(/^\/api\/home\/images\/.+\.jpg$/);

    // Verify file was actually saved
    const filename = data.url.split("/").pop();
    const filePath = path.join(UPLOADS_DIR, filename!);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();

    const request = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 for non-image files", async () => {
    const textBuffer = Buffer.from("not an image");
    const file = new File([textBuffer], "document.txt", {
      type: "text/plain",
    });

    const formData = new FormData();
    formData.append("image", file);

    const request = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("image");
  });

  it("generates unique filenames for multiple uploads", async () => {
    const imageBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from("fake-image-data")
    ]);
    const file1 = new File([imageBuffer], "test.jpg", { type: "image/jpeg" });
    const file2 = new File([imageBuffer], "test.jpg", { type: "image/jpeg" });

    const formData1 = new FormData();
    formData1.append("image", file1);

    const formData2 = new FormData();
    formData2.append("image", file2);

    const request1 = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData1,
    });

    const request2 = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData2,
    });

    const response1 = await POST(request1);
    const response2 = await POST(request2);

    const data1 = await response1.json();
    const data2 = await response2.json();

    expect(data1.url).not.toBe(data2.url);
  });

  it("supports common image formats", async () => {
    const formats = [
      { ext: "jpg", mime: "image/jpeg", magic: Buffer.from([0xff, 0xd8, 0xff]) },
      { ext: "png", mime: "image/png", magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { ext: "gif", mime: "image/gif", magic: Buffer.from([0x47, 0x49, 0x46, 0x38]) },
      { ext: "webp", mime: "image/webp", magic: Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]) },
    ];

    for (const format of formats) {
      const imageBuffer = Buffer.concat([format.magic, Buffer.from("fake-image-data")]);
      const file = new File([imageBuffer], `test.${format.ext}`, {
        type: format.mime,
      });

      const formData = new FormData();
      formData.append("image", file);

      const request = new NextRequest("http://localhost:3000/api/home/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toMatch(new RegExp(`\\.${format.ext}$`));
    }
  });

  it("rejects files exceeding 10MB size limit", async () => {
    // Create a buffer larger than 10MB
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
    const file = new File([largeBuffer], "large-image.jpg", {
      type: "image/jpeg",
    });

    const formData = new FormData();
    formData.append("image", file);

    const request = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("10MB");
  });

  it("rejects files with invalid magic bytes", async () => {
    // Create a file with wrong magic bytes
    const fakeBuffer = Buffer.from("not-a-real-image-file");
    const file = new File([fakeBuffer], "fake.jpg", {
      type: "image/jpeg",
    });

    const formData = new FormData();
    formData.append("image", file);

    const request = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("content");
  });

  it("rejects files with invalid extensions", async () => {
    const imageBuffer = Buffer.from([0xff, 0xd8, 0xff]); // Valid JPEG magic bytes
    const file = new File([imageBuffer], "test.exe", {
      type: "image/jpeg",
    });

    const formData = new FormData();
    formData.append("image", file);

    const request = new NextRequest("http://localhost:3000/api/home/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("extension");
  });
});
