import { NextRequest, NextResponse } from "next/server";
import { fsrs, Rating } from "ts-fsrs";
import { getCard, updateCardFSRS } from "@/lib/cards";
import { recordStudy } from "@/lib/study-log";

const f = fsrs();

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const rating = body.rating as Rating;
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating)) {
    return NextResponse.json({ error: "rating must be 1-4" }, { status: 400 });
  }

  const studyCard = await getCard(params.id);
  if (!studyCard) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // ts-fsrs needs Date objects, but our stored card has ISO strings
  const fsrsCard = {
    ...studyCard.fsrs,
    due: new Date(studyCard.fsrs.due),
    last_review: studyCard.fsrs.last_review
      ? new Date(studyCard.fsrs.last_review)
      : undefined,
  };

  const result = f.next(fsrsCard, new Date(), rating);
  const updated = await updateCardFSRS(params.id, result.card);

  if (studyCard.group_id) {
    const isNew = studyCard.fsrs.state === 0;
    await recordStudy(studyCard.group_id, isNew);
  }

  return NextResponse.json(updated);
}
