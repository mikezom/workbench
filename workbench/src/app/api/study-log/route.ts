import { NextRequest, NextResponse } from "next/server";
import { getGroupStudiedToday } from "@/lib/study-log";

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("group_id");
  if (!groupId) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }
  const log = await getGroupStudiedToday(groupId);
  return NextResponse.json(log);
}
