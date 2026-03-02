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

    // Save groups (append to existing)
    const existingGroups = await getAllGroups();
    const allGroups = [...existingGroups, ...result.groups];
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    );
  }
}
