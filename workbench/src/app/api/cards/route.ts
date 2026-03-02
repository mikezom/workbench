import { NextRequest, NextResponse } from "next/server";
import { getAllCards, createCard } from "@/lib/cards";

export async function GET() {
  const cards = await getAllCards();
  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { front, back } = body;
  if (!front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: "front and back are required" }, { status: 400 });
  }
  const card = await createCard(front.trim(), back.trim());
  return NextResponse.json(card, { status: 201 });
}
