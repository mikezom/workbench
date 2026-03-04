import { NextResponse } from "next/server";
import { migrateDecomposeSupport } from "@/lib/migrate-decompose";

export async function POST() {
  try {
    migrateDecomposeSupport();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      { error: "Migration failed" },
      { status: 500 }
    );
  }
}
