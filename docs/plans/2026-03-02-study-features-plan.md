# Study Section Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add card groups (hierarchical), per-group study settings (daily limits), and Anki .apkg import to the Study section.

**Architecture:** Extend the JSON file storage with `groups.json` and `study_log.json`. Add `group_id` to cards. Server-side Anki parsing using `better-sqlite3` and `adm-zip`. Template rendering converts Anki mustache-like syntax to HTML stored in card front/back.

**Tech Stack:** Next.js App Router, ts-fsrs, better-sqlite3, adm-zip, Tailwind CSS

---

### Task 1: Install New Dependencies

**Files:**
- Modify: `workbench/package.json`

**Step 1: Install better-sqlite3 and adm-zip**

```bash
cd /home/ubuntu/workbench && npm install better-sqlite3 adm-zip
```

**Step 2: Install type definitions**

```bash
cd /home/ubuntu/workbench && npm install -D @types/better-sqlite3 @types/adm-zip
```

**Step 3: Verify installation**

```bash
cd /home/ubuntu/workbench && node -e "require('better-sqlite3'); require('adm-zip'); console.log('OK')"
```
Expected: `OK`

**Step 4: Commit**

```bash
git add workbench/package.json workbench/package-lock.json
git commit -m "feat(study): install better-sqlite3 and adm-zip for anki import"
```

---

### Task 2: Groups Data Layer

**Files:**
- Create: `workbench/src/lib/groups.ts`
- Create: `workbench/data/groups.json`

**Step 1: Create empty groups.json**

Create `workbench/data/groups.json`:
```json
[]
```

**Step 2: Create groups.ts data layer**

Create `workbench/src/lib/groups.ts`:

```typescript
import { promises as fs } from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "groups.json");

export interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  settings: {
    dailyNewLimit: number;
    dailyReviewLimit: number;
  };
  created_at: string;
}

async function readGroups(): Promise<Group[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeGroups(groups: Group[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(groups, null, 2));
}

export async function getAllGroups(): Promise<Group[]> {
  return readGroups();
}

export async function getGroup(id: string): Promise<Group | undefined> {
  const groups = await readGroups();
  return groups.find((g) => g.id === id);
}

export async function createGroup(
  name: string,
  parentId: string | null = null,
  settings?: Partial<Group["settings"]>
): Promise<Group> {
  const groups = await readGroups();
  const group: Group = {
    id: crypto.randomUUID(),
    name,
    parent_id: parentId,
    settings: {
      dailyNewLimit: settings?.dailyNewLimit ?? 20,
      dailyReviewLimit: settings?.dailyReviewLimit ?? 100,
    },
    created_at: new Date().toISOString(),
  };
  groups.push(group);
  await writeGroups(groups);
  return group;
}

export async function updateGroup(
  id: string,
  updates: { name?: string; settings?: Partial<Group["settings"]> }
): Promise<Group | null> {
  const groups = await readGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  if (updates.name !== undefined) groups[idx].name = updates.name;
  if (updates.settings) {
    groups[idx].settings = { ...groups[idx].settings, ...updates.settings };
  }
  await writeGroups(groups);
  return groups[idx];
}

export async function deleteGroup(id: string): Promise<boolean> {
  const groups = await readGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return false;
  groups.splice(idx, 1);
  await writeGroups(groups);
  return true;
}

/** Get all descendant group IDs (inclusive of the given id). */
export async function getDescendantIds(id: string): Promise<string[]> {
  const groups = await readGroups();
  const result: string[] = [id];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const g of groups) {
      if (g.parent_id === current) {
        result.push(g.id);
        queue.push(g.id);
      }
    }
  }
  return result;
}

/** Bulk-create groups, returning created groups. Used by Anki import. */
export async function createGroupsBulk(
  newGroups: Array<{ name: string; parent_id: string | null }>
): Promise<Group[]> {
  const groups = await readGroups();
  const created: Group[] = [];
  for (const ng of newGroups) {
    const group: Group = {
      id: crypto.randomUUID(),
      name: ng.name,
      parent_id: ng.parent_id,
      settings: { dailyNewLimit: 20, dailyReviewLimit: 100 },
      created_at: new Date().toISOString(),
    };
    groups.push(group);
    created.push(group);
  }
  await writeGroups(groups);
  return created;
}
```

**Step 3: Verify it compiles**

```bash
cd /home/ubuntu/workbench && npx tsc --noEmit src/lib/groups.ts 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add workbench/data/groups.json workbench/src/lib/groups.ts
git commit -m "feat(study): add groups data layer with hierarchical support"
```

---

### Task 3: Add group_id to Cards Data Layer

**Files:**
- Modify: `workbench/src/lib/cards.ts`

**Step 1: Add group_id to StudyCard interface and createCard**

In `workbench/src/lib/cards.ts`:

Add `group_id: string | null;` to the `StudyCard` interface (after `source`).

Update `createCard` to accept optional `groupId` parameter:

```typescript
export async function createCard(
  front: string,
  back: string,
  groupId: string | null = null
): Promise<StudyCard> {
  const cards = await readCards();
  const now = new Date().toISOString();
  const card: StudyCard = {
    id: crypto.randomUUID(),
    front,
    back,
    source: null,
    group_id: groupId,
    fsrs: createEmptyCard(new Date()),
    created_at: now,
    updated_at: now,
  };
  cards.push(card);
  await writeCards(cards);
  return card;
}
```

**Step 2: Add getCardsByGroup function**

```typescript
export async function getCardsByGroup(groupIds: string[]): Promise<StudyCard[]> {
  const cards = await readCards();
  return cards.filter((c) => c.group_id !== null && groupIds.includes(c.group_id));
}
```

**Step 3: Add getDueCardsByGroup function**

```typescript
export async function getDueCardsByGroup(groupIds: string[]): Promise<StudyCard[]> {
  const cards = await readCards();
  const now = new Date();
  return cards.filter(
    (c) =>
      c.group_id !== null &&
      groupIds.includes(c.group_id) &&
      new Date(c.fsrs.due) <= now
  );
}
```

**Step 4: Add bulk card creation for imports**

```typescript
export async function createCardsBulk(
  newCards: Array<{ front: string; back: string; group_id: string | null }>
): Promise<StudyCard[]> {
  const cards = await readCards();
  const created: StudyCard[] = [];
  const now = new Date().toISOString();
  for (const nc of newCards) {
    const card: StudyCard = {
      id: crypto.randomUUID(),
      front: nc.front,
      back: nc.back,
      source: null,
      group_id: nc.group_id,
      fsrs: createEmptyCard(new Date()),
      created_at: now,
      updated_at: now,
    };
    cards.push(card);
    created.push(card);
  }
  await writeCards(cards);
  return created;
}
```

**Step 5: Commit**

```bash
git add workbench/src/lib/cards.ts
git commit -m "feat(study): add group_id to cards with group-based queries"
```

---

### Task 4: Study Log Data Layer

**Files:**
- Create: `workbench/src/lib/study-log.ts`
- Create: `workbench/data/study_log.json`

**Step 1: Create empty study_log.json**

Create `workbench/data/study_log.json`:
```json
{}
```

**Step 2: Create study-log.ts**

```typescript
import { promises as fs } from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "study_log.json");

interface DayGroupLog {
  new: number;
  review: number;
}

type StudyLog = Record<string, Record<string, DayGroupLog>>;

async function readLog(): Promise<StudyLog> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeLog(log: StudyLog): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(log, null, 2));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getGroupStudiedToday(
  groupId: string
): Promise<DayGroupLog> {
  const log = await readLog();
  const today = todayKey();
  return log[today]?.[groupId] ?? { new: 0, review: 0 };
}

export async function recordStudy(
  groupId: string,
  isNew: boolean
): Promise<void> {
  const log = await readLog();
  const today = todayKey();
  if (!log[today]) log[today] = {};
  if (!log[today][groupId]) log[today][groupId] = { new: 0, review: 0 };
  if (isNew) {
    log[today][groupId].new++;
  } else {
    log[today][groupId].review++;
  }
  await writeLog(log);
}
```

**Step 3: Commit**

```bash
git add workbench/data/study_log.json workbench/src/lib/study-log.ts
git commit -m "feat(study): add study log data layer for daily limit tracking"
```

---

### Task 5: Groups API Routes

**Files:**
- Create: `workbench/src/app/api/groups/route.ts`
- Create: `workbench/src/app/api/groups/[id]/route.ts`

**Step 1: Create GET/POST /api/groups**

Create `workbench/src/app/api/groups/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAllGroups, createGroup } from "@/lib/groups";

export async function GET() {
  const groups = await getAllGroups();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, parent_id, settings } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const group = await createGroup(name.trim(), parent_id ?? null, settings);
  return NextResponse.json(group, { status: 201 });
}
```

**Step 2: Create PUT/DELETE /api/groups/[id]**

Create `workbench/src/app/api/groups/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateGroup, deleteGroup } from "@/lib/groups";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { name, settings } = body;
  const group = await updateGroup(params.id, { name, settings });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json(group);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = await deleteGroup(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

**Step 3: Commit**

```bash
git add workbench/src/app/api/groups/
git commit -m "feat(study): add groups API routes (CRUD)"
```

---

### Task 6: Update Cards API with group_id Support

**Files:**
- Modify: `workbench/src/app/api/cards/route.ts`
- Modify: `workbench/src/app/api/cards/[id]/review/route.ts`

**Step 1: Update POST /api/cards to accept group_id**

In `workbench/src/app/api/cards/route.ts`, update the POST handler:

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { front, back, group_id } = body;
  if (!front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: "front and back are required" }, { status: 400 });
  }
  const card = await createCard(front.trim(), back.trim(), group_id ?? null);
  return NextResponse.json(card, { status: 201 });
}
```

**Step 2: Update review route to record study log**

In `workbench/src/app/api/cards/[id]/review/route.ts`, add study log recording:

```typescript
import { recordStudy } from "@/lib/study-log";

// Inside POST handler, after updating FSRS, before returning:
if (studyCard.group_id) {
  const isNew = studyCard.fsrs.state === 0;
  await recordStudy(studyCard.group_id, isNew);
}
```

**Step 3: Commit**

```bash
git add workbench/src/app/api/cards/route.ts workbench/src/app/api/cards/[id]/review/route.ts
git commit -m "feat(study): update cards API with group_id and study log recording"
```

---

### Task 7: Anki Import Logic

**Files:**
- Create: `workbench/src/lib/anki-import.ts`

**Step 1: Create anki-import.ts**

This file handles:
1. Extracting the .apkg ZIP
2. Reading the SQLite database
3. Parsing models (templates + fields), decks, notes, cards
4. Rendering Anki templates (field substitution, conditionals, FrontSide, hint)
5. Mapping decks to groups
6. Stripping `[sound:...]` tags

```typescript
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
    qfmt: string; // front template
    afmt: string; // back template
  }>;
}

interface AnkiDeck {
  id: string;
  name: string;
}

interface AnkiNote {
  id: number;
  mid: string; // model id
  flds: string; // fields separated by \x1f
}

interface AnkiCard {
  nid: number; // note id
  did: string; // deck id
  ord: number; // template ordinal
}

export interface ImportResult {
  groups: Array<{ id: string; name: string; parent_id: string | null }>;
  cards: Array<{ front: string; back: string; group_id: string }>;
}

/** Render an Anki template by substituting fields. */
function renderTemplate(
  template: string,
  fields: Record<string, string>,
  frontRendered?: string
): string {
  let result = template;

  // Replace {{FrontSide}}
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

  // Handle {{hint:field}} - render as field value
  result = result.replace(/\{\{hint:(\w+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  // Handle simple field substitution {{field}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  // Strip [sound:...] tags
  result = result.replace(/\[sound:[^\]]*\]/g, "");

  // Strip HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  return result.trim();
}

/** Parse an .apkg file buffer and return groups + cards to import. */
export async function parseApkg(
  fileBuffer: Buffer,
  notesPerDeck: number = 10
): Promise<ImportResult> {
  // Extract ZIP to temp directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-"));
  const zip = new AdmZip(fileBuffer);
  zip.extractAllTo(tmpDir, true);

  const dbPath = path.join(tmpDir, "collection.anki2");
  const db = new Database(dbPath, { readonly: true });

  try {
    // Parse collection metadata
    const col = db.prepare("SELECT models, decks FROM col").get() as {
      models: string;
      decks: string;
    };

    // Parse models
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

    // Parse decks
    const decksRaw = JSON.parse(col.decks) as Record<string, any>;
    const decks: Map<string, AnkiDeck> = new Map();
    for (const [did, d] of Object.entries(decksRaw)) {
      if (did === "1" && d.name === "Default") continue; // skip default deck
      decks.set(did, { id: did, name: d.name });
    }

    // Build group hierarchy from deck names using :: separator
    const groupMap = new Map<string, { id: string; name: string; parent_id: string | null }>();
    const deckIdToGroupId = new Map<string, string>();

    // Sort decks by name length so parents are processed first
    const sortedDecks = [...decks.values()].sort(
      (a, b) => a.name.length - b.name.length
    );

    for (const deck of sortedDecks) {
      const parts = deck.name.split("::");
      const leafName = parts[parts.length - 1];
      let parentGroupId: string | null = null;

      if (parts.length > 1) {
        const parentName = parts.slice(0, -1).join("::");
        // Find parent group
        for (const [, g] of groupMap) {
          // Reconstruct full name to match
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

    // Read notes
    const notesRows = db.prepare("SELECT id, mid, flds FROM notes").all() as AnkiNote[];
    const notesMap = new Map<number, AnkiNote>();
    for (const n of notesRows) {
      notesMap.set(n.id, n);
    }

    // Read cards
    const cardsRows = db.prepare("SELECT nid, did, ord FROM cards").all() as AnkiCard[];

    // Group cards by deck, limit notes per deck
    const deckNotes = new Map<string, Set<number>>();
    const limitedCards: AnkiCard[] = [];

    for (const card of cardsRows) {
      const deckId = String(card.did);
      if (!deckIdToGroupId.has(deckId)) continue;

      if (!deckNotes.has(deckId)) deckNotes.set(deckId, new Set());
      const noteSet = deckNotes.get(deckId)!;

      // Only include if under the per-deck note limit
      if (noteSet.size < notesPerDeck || noteSet.has(card.nid)) {
        noteSet.add(card.nid);
        limitedCards.push(card);
      }
    }

    // Render cards
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

      // Build field map
      const fieldValues = note.flds.split("\x1f");
      const fields: Record<string, string> = {};
      for (let i = 0; i < model.fields.length; i++) {
        fields[model.fields[i]] = fieldValues[i] ?? "";
      }

      // Render front and back
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
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Helper: reconstruct full group name from hierarchy */
function getFullGroupName(
  groupId: string,
  groupMap: Map<string, { id: string; name: string; parent_id: string | null }>
): string {
  const group = groupMap.get(groupId);
  if (!group) return "";
  if (!group.parent_id) return group.name;
  return getFullGroupName(group.parent_id, groupMap) + "::" + group.name;
}
```

**Step 2: Commit**

```bash
git add workbench/src/lib/anki-import.ts
git commit -m "feat(study): add Anki .apkg import parser with template rendering"
```

---

### Task 8: Anki Import API Route

**Files:**
- Create: `workbench/src/app/api/import/anki/route.ts`

**Step 1: Create the import endpoint**

```typescript
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

    // Save groups directly (append to existing)
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
```

**Step 2: Commit**

```bash
git add workbench/src/app/api/import/anki/
git commit -m "feat(study): add Anki import API endpoint"
```

---

### Task 9: Rewrite Study Page UI

**Files:**
- Modify: `workbench/src/app/study/page.tsx`

This is the largest task. The study page needs:
1. Three tabs: Review, Cards, Settings
2. Group selector tree in Review and Cards tabs
3. Per-group study limits enforced in Review
4. Import button in Cards tab
5. Group CRUD in Settings tab

The complete rewrite of `page.tsx` should include:

**Key UI components within the page:**

- `GroupTree` - recursive tree rendering of groups, click to select
- `ReviewTab` - group selector + due cards with daily limit enforcement
  - Fetches study log for selected group
  - Separates new (state=0) from review cards
  - Caps each to remaining daily budget
- `CardsTab` - group selector + card list + add card + import button
  - Filter cards by selected group
  - Import button opens file picker, uploads .apkg
- `SettingsTab` - group management + per-group settings editor
  - Create/rename/delete groups
  - Edit dailyNewLimit and dailyReviewLimit per group

**Review flow with limits:**
1. User selects a group
2. Fetch due cards for that group (including descendants)
3. Fetch today's study log for that group
4. Calculate: `remainingNew = settings.dailyNewLimit - log.new`
5. Calculate: `remainingReview = settings.dailyReviewLimit - log.review`
6. Show new cards up to remainingNew + review cards up to remainingReview
7. After rating, study log is updated server-side (Task 6 already handles this)

**Card rendering:** Since cards imported from Anki contain HTML in front/back, use `dangerouslySetInnerHTML` to render card content.

**Step 1: Rewrite the complete page.tsx**

The page should be rewritten in full. It's a client component with the following structure:

```
StudyPage
  - Tab bar: Review | Cards | Settings
  - State: groups[], cards[], selectedGroupId, studyLog, tab
  - On mount: fetch groups + cards

  ReviewTab
    - GroupSelector (dropdown/tree)
    - Filters due cards by selected group descendants
    - Enforces daily limits from study log
    - Card display with dangerouslySetInnerHTML for HTML content
    - Rating buttons

  CardsTab
    - GroupSelector
    - Card list filtered by group
    - Add card form (with group assignment)
    - Import button: file input -> POST /api/import/anki

  SettingsTab
    - Group list with create/edit/delete
    - Per-group limit editors (dailyNewLimit, dailyReviewLimit)
```

**Step 2: Test manually**

```bash
cd /home/ubuntu/workbench && npm run dev
```

Verify:
1. Groups can be created in Settings tab
2. Cards can be added to groups in Cards tab
3. Review respects group selection and daily limits
4. Import button works with the sample .apkg file

**Step 3: Commit**

```bash
git add workbench/src/app/study/page.tsx
git commit -m "feat(study): rewrite study page with groups, settings, and import UI"
```

---

### Task 10: Test Anki Import End-to-End

**Step 1: Start the dev server and test import**

```bash
cd /home/ubuntu/workbench && npm run dev
```

Using curl to test the import API:

```bash
curl -X POST http://localhost:5090/api/import/anki \
  -F "file=@/home/ubuntu/5500.apkg" \
  -F "notesPerDeck=10"
```

Expected: JSON response with groupsCreated and cardsCreated counts.

**Step 2: Verify cards.json and groups.json have data**

```bash
cat workbench/data/groups.json | python3 -m json.tool | head -30
cat workbench/data/cards.json | python3 -m json.tool | head -50
```

**Step 3: Verify review flow works**

Open browser to http://localhost:5090/study:
- Groups appear in selector
- Cards show in review with HTML rendered
- Daily limits are respected

**Step 4: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix(study): resolve issues from end-to-end testing"
```

---

### Task 11: Migrate Existing Cards

**Step 1: Add group_id to existing cards**

Existing cards in `cards.json` need `group_id: null` added. The code already handles this (createCard defaults to null), but verify existing cards load correctly. If any card lacks `group_id`, the code should treat it as ungrouped.

**Step 2: Verify the app handles ungrouped cards**

- Ungrouped cards should appear when no group is selected (or under an "Ungrouped" section)
- Review of ungrouped cards should still work

**Step 3: Commit if changes needed**

```bash
git add workbench/
git commit -m "fix(study): handle ungrouped cards gracefully"
```

---

### Task 12: Final Verification and Cleanup

**Step 1: Run build to check for TypeScript errors**

```bash
cd /home/ubuntu/workbench && npm run build
```

**Step 2: Test all flows manually**

1. Create a group manually
2. Add a card to that group
3. Review cards in that group
4. Import the Anki file (10 notes per deck)
5. Browse imported groups and cards
6. Review imported cards
7. Verify daily limits work (study some cards, check counter)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(study): complete card groups, study settings, and anki import"
```

**Step 4: Update PROGRESS.md**

Add entries for the new features under Phase 3.
