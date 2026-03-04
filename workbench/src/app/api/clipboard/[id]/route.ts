import { NextRequest, NextResponse } from "next/server";
import {
  updateClipboardItem,
  deleteClipboardItem,
} from "@/lib/clipboard-db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { content, language } = body;

  const updated = updateClipboardItem(params.id, {
    content,
    language,
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteClipboardItem(params.id);

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
