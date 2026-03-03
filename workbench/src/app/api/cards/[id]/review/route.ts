import { NextRequest, NextResponse } from "next/server";
import { Rating } from "ts-fsrs";
import { reviewCard } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const rating = body.rating as Rating;
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating)) {
    return NextResponse.json({ error: "rating must be 1-4" }, { status: 400 });
  }

  const result = reviewCard(params.id, rating);
  if (!result) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
