import { NextRequest, NextResponse } from "next/server";
import { parseApkg } from "@/lib/anki-import";
import { createCardsBulk } from "@/lib/cards";
import { getAllGroups } from "@/lib/groups";
import { promises as fs } from "fs";
import path from "path";

const GROUPS_PATH = path.join(process.cwd(), "data", "groups.json");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const notesPerDeck = parseInt(formData.get("notesPerDeck") as string) || 10;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseApkg(buffer, notesPerDeck);

    // Save groups (append to existing, add default settings)
    const existingGroups = await getAllGroups();
    const now = new Date().toISOString();
    const groupsWithSettings = result.groups.map((g) => ({
      ...g,
      settings: { dailyNewLimit: 20, dailyReviewLimit: 100 },
      created_at: now,
    }));
    const allGroups = [...existingGroups, ...groupsWithSettings];
    await fs.writeFile(GROUPS_PATH, JSON.stringify(allGroups, null, 2));

    // Save cards
    const created = await createCardsBulk(
      result.cards.map((c) => ({
        front: c.front,
        back: c.back,
        group_id: c.group_id,
      }))
    );

    return NextResponse.json({
      groupsCreated: result.groups.length,
      cardsCreated: created.length,
      groups: result.groups.map((g) => ({ id: g.id, name: g.name })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
