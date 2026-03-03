import { NextResponse } from "next/server";
import { migrateFromJson } from "@/lib/db";

export async function POST() {
  const result = await migrateFromJson();
  return NextResponse.json(result);
}
