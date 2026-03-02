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
  // Use [^}]+ to match Unicode field names (e.g., Chinese characters)
  result = result.replace(
    /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      const value = fields[fieldName] ?? "";
      return value.trim() ? content : "";
    }
  );

  // Handle {{hint:field}}
  result = result.replace(/\{\{hint:([^}]+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  // Handle simple {{field}}
  result = result.replace(/\{\{([^}#/]+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  // Strip [sound:...] tags
  result = result.replace(/\[sound:[^\]]*\]/g, "");

  // Strip HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  return result.trim();
}

export async function parseApkg(
  fileBuffer: Buffer,
  maxNotes: number = 0
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

    const modelsRaw = JSON.parse(col.models) as Record<string, {
      name: string;
      flds: Array<{ name: string }>;
      tmpls: Array<{ name: string; qfmt: string; afmt: string }>;
    }>;
    const models: Map<string, AnkiModel> = new Map();
    for (const [mid, m] of Object.entries(modelsRaw)) {
      models.set(mid, {
        id: mid,
        name: m.name,
        fields: m.flds.map((f) => f.name),
        templates: m.tmpls.map((t) => ({
          name: t.name,
          qfmt: t.qfmt,
          afmt: t.afmt,
        })),
      });
    }

    // Parse decks to find a good group name (use root deck name)
    const decksRaw = JSON.parse(col.decks) as Record<string, { name: string }>;
    const deckNames: string[] = [];
    for (const [did, d] of Object.entries(decksRaw)) {
      if (did === "1" && d.name === "Default") continue;
      deckNames.push(d.name);
    }

    // Find root name: common prefix before "::" or shortest deck name
    let groupName = "Imported Deck";
    if (deckNames.length > 0) {
      const roots = deckNames.map((n) => n.split("::")[0]);
      const uniqueRoots = Array.from(new Set(roots));
      groupName = uniqueRoots.length === 1 ? uniqueRoots[0] : deckNames.sort((a, b) => a.length - b.length)[0];
    }

    // Create a single group for the entire package
    const groupId = crypto.randomUUID();

    // Get all notes and cards from the database
    const notesRows = db.prepare("SELECT id, mid, flds FROM notes").all() as AnkiNote[];
    const notesMap = new Map<number, AnkiNote>();
    for (const n of notesRows) {
      notesMap.set(n.id, n);
    }

    const cardsRows = db.prepare("SELECT nid, did, ord FROM cards").all() as AnkiCard[];

    // Limit by unique notes across the entire package
    const seenNotes = new Set<number>();
    const limitedCards: AnkiCard[] = [];

    for (const card of cardsRows) {
      if (maxNotes > 0 && seenNotes.size >= maxNotes && !seenNotes.has(card.nid)) {
        continue;
      }
      seenNotes.add(card.nid);
      limitedCards.push(card);
    }

    const resultCards: ImportResult["cards"] = [];

    for (const card of limitedCards) {
      const note = notesMap.get(card.nid);
      if (!note) continue;

      const model = models.get(String(note.mid));
      if (!model) continue;

      const template = model.templates[card.ord];
      if (!template) continue;

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
      groups: [{ id: groupId, name: groupName, parent_id: null }],
      cards: resultCards,
    };
  } finally {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
