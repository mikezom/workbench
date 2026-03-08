import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const AVATARS_DIR = path.join(
  process.cwd(),
  "..",
  "..",
  "shared-data",
  "avatars"
);

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(AVATARS_DIR, filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(AVATARS_DIR);
  if (!resolvedPath.startsWith(resolvedDir)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
