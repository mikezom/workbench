import { NextResponse } from "next/server";
import { getAvailableSkills } from "@/lib/agents-fs";

export async function GET() {
  const skills = getAvailableSkills();
  return NextResponse.json({ skills });
}
