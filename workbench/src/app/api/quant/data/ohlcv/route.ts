import { NextRequest, NextResponse } from "next/server";
import { getOhlcv } from "@/lib/tushare-db";

export function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const start = req.nextUrl.searchParams.get("start") ?? "20210101";
  const end = req.nextUrl.searchParams.get("end") ?? "20251231";

  if (!code) {
    return NextResponse.json({ error: "code parameter is required" }, { status: 400 });
  }

  const data = getOhlcv(code, start, end);
  return NextResponse.json(data);
}
