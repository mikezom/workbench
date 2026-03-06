import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "..", "..", "shared-data", "images");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CACHE_DURATION = "public, max-age=31536000, immutable";

// Map file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

  // Security: Check for path traversal attempts
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Construct the full file path
  const filePath = path.join(IMAGES_DIR, filename);

  // Security: Verify the resolved path is within IMAGES_DIR
  const resolvedPath = path.resolve(filePath);
  const resolvedImagesDir = path.resolve(IMAGES_DIR);
  if (!resolvedPath.startsWith(resolvedImagesDir)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    // Check file size before reading
    const stats = await fs.stat(filePath);

    if (stats.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large" },
        { status: 413 }
      );
    }

    // Get file extension and determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Read the file
    const fileBuffer = await fs.readFile(filePath);

    // Return the image with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_DURATION,
      },
    });
  } catch (error: unknown) {
    // Handle file not found
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Handle permission errors
    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Handle other errors
    console.error("Error reading image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
