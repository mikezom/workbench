import Database from "better-sqlite3";
import AdmZip from "adm-zip";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

interface AnkiModel {
  id: string;
  name: string;
  fields: string[];
  templates: Array<{
    name: string;
    qfmt: string;
    afmt: string;
  }>;
}

interface AnkiDeck {
  id: string;
  name: string;
}

interface AnkiNote {
  id: number;
  mid: string;
  flds: string;
}

interface AnkiCard {
  nid: number;
  did: string;
  ord: number;
}

export interface ImportResult {
  groups: Array<{ id: string; name: string; parent_id: string | null }>;
  cards: Array<{ front: string; back: string; group_id: string }>;
}

function renderTemplate(
  template: string,
  fields: Record<string, string>,
  frontRendered?: string
): string {
  let result = template;

  if (frontRendered !== undefined) {
    result = result.replace(/\{\{FrontSide\}\}/g, frontRendered);
  }

  // Handle conditional blocks: {{#field}}...{{/field}}
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      const value = fields[fieldName] ?? "";
      return value.trim() ? content : "";
    }
  );

  // Handle {{hint:field}}
  result = result.replace(/\{\{hint:(\w+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  // Handle simple {{field}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  // Strip [sound:...] tags
  result = result.replace(/\[sound:[^\]]*\]/g, "");

  // Strip HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  return result.trim();
}

function getFullGroupName(
  groupId: string,
  groupMap: Map<string, { id: string; name: string; parent_id: string | null }>
): string {
  const group = groupMap.get(groupId);
  if (!group) return "";
  if (!group.parent_id) return group.name;
  return getFullGroupName(group.parent_id, groupMap) + "::" + group.name;
}

export async function parseApkg(
  fileBuffer: Buffer,
  notesPerDeck: number = 10
): Promise<ImportResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-"));
  const zip = new AdmZip(fileBuffer);
  zip.extractAllTo(tmpDir, true);

  const dbPath = path.join(tmpDir, "collection.anki2");
  const db = new Database(dbPath, { readonly: true });

  try {
    const col = db.prepare("SELECT models, decks FROM col").get() as {
      models: string;
      decks: string;
    };

    const modelsRaw = JSON.parse(col.models) as Record<string, any>;
    const models: Map<string, AnkiModel> = new Map();
    for (const [mid, m] of Object.entries(modelsRaw)) {
      models.set(mid, {
        id: mid,
        name: m.name,
        fields: m.flds.map((f: any) => f.name),
        templates: m.tmpls.map((t: any) => ({
          name: t.name,
          qfmt: t.qfmt,
          afmt: t.afmt,
        })),
      });
    }

    const decksRaw = JSON.parse(col.decks) as Record<string, any>;
    const decks: Map<string, AnkiDeck> = new Map();
    for (const [did, d] of Object.entries(decksRaw)) {
      if (did === "1" && d.name === "Default") continue;
      decks.set(did, { id: did, name: d.name });
    }

    const groupMap = new Map<string, { id: string; name: string; parent_id: string | null }>();
    const deckIdToGroupId = new Map<string, string>();

    const sortedDecks = [...decks.values()].sort(
      (a, b) => a.name.length - b.name.length
    );

    for (const deck of sortedDecks) {
      const parts = deck.name.split("::");
      const leafName = parts[parts.length - 1];
      let parentGroupId: string | null = null;

      if (parts.length > 1) {
        const parentName = parts.slice(0, -1).join("::");
        for (const [, g] of groupMap) {
          if (getFullGroupName(g.id, groupMap) === parentName) {
            parentGroupId = g.id;
            break;
          }
        }
      }

      const groupId = crypto.randomUUID();
      groupMap.set(groupId, {
        id: groupId,
        name: leafName,
        parent_id: parentGroupId,
      });
      deckIdToGroupId.set(deck.id, groupId);
    }

    const notesRows = db.prepare("SELECT id, mid, flds FROM notes").all() as AnkiNote[];
    const notesMap = new Map<number, AnkiNote>();
    for (const n of notesRows) {
      notesMap.set(n.id, n);
    }

    const cardsRows = db.prepare("SELECT nid, did, ord FROM cards").all() as AnkiCard[];

    const deckNotes = new Map<string, Set<number>>();
    const limitedCards: AnkiCard[] = [];

    for (const card of cardsRows) {
      const deckId = String(card.did);
      if (!deckIdToGroupId.has(deckId)) continue;

      if (!deckNotes.has(deckId)) deckNotes.set(deckId, new Set());
      const noteSet = deckNotes.get(deckId)!;

      if (noteSet.size < notesPerDeck || noteSet.has(card.nid)) {
        noteSet.add(card.nid);
        limitedCards.push(card);
      }
    }

    const resultCards: ImportResult["cards"] = [];

    for (const card of limitedCards) {
      const note = notesMap.get(card.nid);
      if (!note) continue;

      const model = models.get(String(note.mid));
      if (!model) continue;

      const template = model.templates[card.ord];
      if (!template) continue;

      const groupId = deckIdToGroupId.get(String(card.did));
      if (!groupId) continue;

      const fieldValues = note.flds.split("\x1f");
      const fields: Record<string, string> = {};
      for (let i = 0; i < model.fields.length; i++) {
        fields[model.fields[i]] = fieldValues[i] ?? "";
      }

      const front = renderTemplate(template.qfmt, fields);
      const back = renderTemplate(template.afmt, fields, front);

      if (front.trim()) {
        resultCards.push({ front, back, group_id: groupId });
      }
    }

    return {
      groups: [...groupMap.values()],
      cards: resultCards,
    };
  } finally {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
