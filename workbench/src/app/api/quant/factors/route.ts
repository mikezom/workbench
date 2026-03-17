import { NextRequest, NextResponse } from "next/server";
import { listFactors } from "@/lib/quant-db";

export function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const factors = listFactors(category);
  return NextResponse.json(factors);
}
