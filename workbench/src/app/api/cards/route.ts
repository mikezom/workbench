import { NextRequest, NextResponse } from "next/server";
import { getAllCards, createCard } from "@/lib/cards";

export async function GET() {
  const cards = await getAllCards();
  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { front, back, group_id, title, definition, example } = body;
  // Support both old (front/back) and new (title/definition/example) formats
  const cardFront = front?.trim() || title?.trim() || "";
  const cardBack = back?.trim() || definition?.trim() || "";
  if (!cardFront || !cardBack) {
    return NextResponse.json({ error: "front/back or title/definition are required" }, { status: 400 });
  }
  const card = await createCard(cardFront, cardBack, group_id ?? null, { title, definition, example });
  return NextResponse.json(card, { status: 201 });
}
