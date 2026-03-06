import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "..", "..", "shared-data", "images");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Magic bytes for image validation
const MAGIC_BYTES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF header
};

function validateMagicBytes(buffer: Buffer): boolean {
  // Check JPEG
  if (
    buffer[0] === MAGIC_BYTES.jpeg[0] &&
    buffer[1] === MAGIC_BYTES.jpeg[1] &&
    buffer[2] === MAGIC_BYTES.jpeg[2]
  ) {
    return true;
  }

  // Check PNG
  if (
    buffer[0] === MAGIC_BYTES.png[0] &&
    buffer[1] === MAGIC_BYTES.png[1] &&
    buffer[2] === MAGIC_BYTES.png[2] &&
    buffer[3] === MAGIC_BYTES.png[3]
  ) {
    return true;
  }

  // Check GIF
  if (
    buffer[0] === MAGIC_BYTES.gif[0] &&
    buffer[1] === MAGIC_BYTES.gif[1] &&
    buffer[2] === MAGIC_BYTES.gif[2] &&
    buffer[3] === MAGIC_BYTES.gif[3]
  ) {
    return true;
  }

  // Check WebP (RIFF header + WEBP signature at bytes 8-11)
  if (
    buffer[0] === MAGIC_BYTES.webp[0] &&
    buffer[1] === MAGIC_BYTES.webp[1] &&
    buffer[2] === MAGIC_BYTES.webp[2] &&
    buffer[3] === MAGIC_BYTES.webp[3] &&
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.error(`File size exceeds limit: ${file.size} bytes`);
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error(`Invalid MIME type: ${file.type}`);
      return NextResponse.json(
        { error: "File must be an image (jpg, png, gif, or webp)" },
        { status: 400 }
      );
    }

    // Sanitize and validate extension
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      console.error(`Invalid file extension: ${ext}`);
      return NextResponse.json(
        { error: "Invalid file extension" },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file content using magic bytes
    if (!validateMagicBytes(buffer)) {
      console.error("File content validation failed: invalid magic bytes");
      return NextResponse.json(
        { error: "File content does not match image format" },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    // Generate unique filename with sanitized extension
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const filename = `${timestamp}-${random}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Save file asynchronously
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({ url: `/api/home/images/${filename}` });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
