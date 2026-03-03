import { NextRequest, NextResponse } from "next/server";
import { getTaskOutput } from "@/lib/agent-db";

export function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = Number(params.id);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 100;
  const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;

  const output = getTaskOutput(taskId, { limit, offset });
  return NextResponse.json(output);
}
