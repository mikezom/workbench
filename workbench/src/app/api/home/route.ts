import { NextRequest, NextResponse } from "next/server";
import { getAllHomePosts, createHomePost } from "@/lib/home-db";

export function GET() {
  const posts = getAllHomePosts();
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, image_url } = body;

  if (!content || content.trim() === "") {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  const post = createHomePost({
    content: content.trim(),
    image_url,
  });

  return NextResponse.json(post, { status: 201 });
}
