import { NextRequest, NextResponse } from "next/server";
import { parseApkg } from "@/lib/anki-import";
import { createCardsBulk, createGroup } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const maxNotes = parseInt(formData.get("maxNotes") as string) || 0;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseApkg(buffer, maxNotes);

    // Create groups via DB
    const createdGroups = result.groups.map((g) =>
      createGroup(g.name, g.parent_id)
    );

    // Map old group IDs from parser to new DB group IDs
    const groupIdMap = new Map<string, string>();
    for (let i = 0; i < result.groups.length; i++) {
      groupIdMap.set(result.groups[i].id, createdGroups[i].id);
    }

    // Create cards with remapped group IDs — bulk create handles distribution
    const created = createCardsBulk(
      result.cards.map((c) => ({
        front: c.front,
        back: c.back,
        group_id: groupIdMap.get(c.group_id) ?? null,
      }))
    );

    return NextResponse.json({
      groupsCreated: createdGroups.length,
      cardsCreated: created.length,
      groups: createdGroups.map((g) => ({ id: g.id, name: g.name })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
