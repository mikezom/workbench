import { NextRequest, NextResponse } from "next/server";
import { getAllClipboardItems, createClipboardItem } from "@/lib/clipboard-db";

export function GET() {
  const items = getAllClipboardItems();
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, language } = body;

  if (!content || content.trim() === "") {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  const item = createClipboardItem({
    content: content.trim(),
    language,
  });

  return NextResponse.json(item, { status: 201 });
}
