import { NextRequest, NextResponse } from "next/server";
import { getSessionCards } from "@/lib/db";

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("group_id");
  const result = getSessionCards(groupId);
  return NextResponse.json(result);
}
