# Study Section (FSRS) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a working FSRS flashcard system at `/study` with card CRUD and review sessions.

**Architecture:** Next.js App Router with API route handlers for card operations, `ts-fsrs` for scheduling, JSON file storage. Single `/study` page with client-side tabs (Review / Cards). All FSRS logic runs server-side in API routes.

**Tech Stack:** Next.js 14 (App Router), ts-fsrs, Tailwind CSS, JSON file storage

---

### Task 1: Install ts-fsrs

**Files:**
- Modify: `workbench/package.json`

**Step 1: Install the library**

Run: `cd /home/ubuntu/workbench && npm install ts-fsrs`

**Step 2: Verify installation**

Run: `cd /home/ubuntu/workbench && node -e "const { fsrs, createEmptyCard, Rating } = require('ts-fsrs'); console.log('Rating.Good =', Rating.Good);"`
Expected: `Rating.Good = 3`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(study): install ts-fsrs library"
```

---

### Task 2: Card storage layer

**Files:**
- Create: `workbench/src/lib/cards.ts`

This module reads/writes `data/cards.json` and provides CRUD functions. All functions are async (file I/O).

**Step 1: Create the storage module**

```typescript
// workbench/src/lib/cards.ts
import { promises as fs } from "fs";
import path from "path";
import { createEmptyCard, type Card as FSRSCard } from "ts-fsrs";

const DATA_PATH = path.join(process.cwd(), "data", "cards.json");

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  source: string | null;
  fsrs: FSRSCard;
  created_at: string;
  updated_at: string;
}

async function readCards(): Promise<StudyCard[]> {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeCards(cards: StudyCard[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(cards, null, 2));
}

export async function getAllCards(): Promise<StudyCard[]> {
  return readCards();
}

export async function getCard(id: string): Promise<StudyCard | undefined> {
  const cards = await readCards();
  return cards.find((c) => c.id === id);
}

export async function getDueCards(): Promise<StudyCard[]> {
  const cards = await readCards();
  const now = new Date();
  return cards.filter((c) => new Date(c.fsrs.due) <= now);
}

export async function createCard(front: string, back: string): Promise<StudyCard> {
  const cards = await readCards();
  const now = new Date().toISOString();
  const card: StudyCard = {
    id: crypto.randomUUID(),
    front,
    back,
    source: null,
    fsrs: createEmptyCard(new Date()),
    created_at: now,
    updated_at: now,
  };
  cards.push(card);
  await writeCards(cards);
  return card;
}

export async function updateCard(
  id: string,
  updates: { front?: string; back?: string }
): Promise<StudyCard | null> {
  const cards = await readCards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  if (updates.front !== undefined) cards[idx].front = updates.front;
  if (updates.back !== undefined) cards[idx].back = updates.back;
  cards[idx].updated_at = new Date().toISOString();
  await writeCards(cards);
  return cards[idx];
}

export async function updateCardFSRS(
  id: string,
  fsrsCard: FSRSCard
): Promise<StudyCard | null> {
  const cards = await readCards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cards[idx].fsrs = fsrsCard;
  cards[idx].updated_at = new Date().toISOString();
  await writeCards(cards);
  return cards[idx];
}

export async function deleteCard(id: string): Promise<boolean> {
  const cards = await readCards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  cards.splice(idx, 1);
  await writeCards(cards);
  return true;
}
```

**Step 2: Verify it compiles**

Run: `cd /home/ubuntu/workbench && npx tsc --noEmit src/lib/cards.ts` (or just run `npm run build` — but a quick type check is faster)

If tsc complains about module resolution, just verify no red squiggles in the import and move on — Next.js bundler handles it at runtime.

**Step 3: Commit**

```bash
git add src/lib/cards.ts
git commit -m "feat(study): add card storage layer with CRUD operations"
```

---

### Task 3: API route — GET/POST /api/cards

**Files:**
- Create: `workbench/src/app/api/cards/route.ts`

**Step 1: Create the route handler**

```typescript
// workbench/src/app/api/cards/route.ts
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
```

**Step 2: Test with curl**

Run dev server: `cd /home/ubuntu/workbench && npm run dev &`

```bash
# Create a card
curl -s -X POST http://localhost:5090/api/cards \
  -H 'Content-Type: application/json' \
  -d '{"front":"What is FSRS?","back":"Free Spaced Repetition Scheduler"}' | head -c 200

# List cards
curl -s http://localhost:5090/api/cards | head -c 200
```

Expected: POST returns a card object with id/fsrs fields. GET returns an array with that card.

**Step 3: Commit**

```bash
git add src/app/api/cards/route.ts
git commit -m "feat(study): add GET/POST /api/cards route handlers"
```

---

### Task 4: API route — PUT/DELETE /api/cards/[id]

**Files:**
- Create: `workbench/src/app/api/cards/[id]/route.ts`

**Step 1: Create the route handler**

```typescript
// workbench/src/app/api/cards/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateCard, deleteCard, getCard } from "@/lib/cards";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { front, back } = body;
  const card = await updateCard(params.id, { front, back });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json(card);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = await deleteCard(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

**Step 2: Test with curl**

```bash
# Get a card ID from the list
ID=$(curl -s http://localhost:5090/api/cards | node -e "process.stdin.on('data',d=>{const c=JSON.parse(d);if(c.length)console.log(c[0].id)})")

# Update it
curl -s -X PUT "http://localhost:5090/api/cards/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"front":"Updated question","back":"Updated answer"}'

# Delete it
curl -s -X DELETE "http://localhost:5090/api/cards/$ID"
```

**Step 3: Commit**

```bash
git add src/app/api/cards/\[id\]/route.ts
git commit -m "feat(study): add PUT/DELETE /api/cards/[id] route handlers"
```

---

### Task 5: API route — POST /api/cards/[id]/review

**Files:**
- Create: `workbench/src/app/api/cards/[id]/review/route.ts`

This endpoint accepts a rating (1-4), runs FSRS scheduling, and saves the updated card.

**Step 1: Create the route handler**

```typescript
// workbench/src/app/api/cards/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fsrs, Rating } from "ts-fsrs";
import { getCard, updateCardFSRS } from "@/lib/cards";

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
  return NextResponse.json(updated);
}
```

**Step 2: Test with curl**

```bash
# Create a test card first
CARD=$(curl -s -X POST http://localhost:5090/api/cards \
  -H 'Content-Type: application/json' \
  -d '{"front":"Test Q","back":"Test A"}')
ID=$(echo "$CARD" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")

# Review it with "Good" (3)
curl -s -X POST "http://localhost:5090/api/cards/$ID/review" \
  -H 'Content-Type: application/json' \
  -d '{"rating":3}'
```

Expected: Card returned with updated `fsrs.due` in the future, `fsrs.reps` incremented.

**Step 3: Commit**

```bash
git add src/app/api/cards/\[id\]/review/route.ts
git commit -m "feat(study): add POST /api/cards/[id]/review with FSRS scheduling"
```

---

### Task 6: Study page — tab layout and Cards tab

**Files:**
- Rewrite: `workbench/src/app/study/page.tsx`

Build the tabbed layout as a client component. Cards tab shows the card list with inline add/edit/delete.

**Step 1: Rewrite the study page**

```tsx
// workbench/src/app/study/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import PageContainer from "@/components/page-container";

interface StudyCard {
  id: string;
  front: string;
  back: string;
  fsrs: { due: string; reps: number; state: number };
  created_at: string;
}

type Tab = "review" | "cards";

export default function StudyPage() {
  const [tab, setTab] = useState<Tab>("review");
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/cards");
    const data = await res.json();
    setCards(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  return (
    <PageContainer title="Study">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-neutral-700">
        {(["review", "cards"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === t
                ? "border-b-2 border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : tab === "review" ? (
        <ReviewTab cards={cards} onUpdate={fetchCards} />
      ) : (
        <CardsTab cards={cards} onUpdate={fetchCards} />
      )}
    </PageContainer>
  );
}

/* ── Review Tab ── */

function ReviewTab({
  cards,
  onUpdate,
}: {
  cards: StudyCard[];
  onUpdate: () => Promise<void>;
}) {
  const dueCards = cards.filter((c) => new Date(c.fsrs.due) <= new Date());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset index when due cards change
  useEffect(() => { setCurrentIdx(0); setRevealed(false); }, [dueCards.length]);

  if (cards.length === 0) {
    return <p className="text-neutral-500">No cards yet. Add some in the Cards tab.</p>;
  }

  if (dueCards.length === 0) {
    // Find next due card
    const sorted = [...cards].sort(
      (a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime()
    );
    const nextDue = new Date(sorted[0].fsrs.due);
    return (
      <div className="text-neutral-500">
        <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          All caught up!
        </p>
        <p>Next review: {nextDue.toLocaleString()}</p>
      </div>
    );
  }

  const card = dueCards[currentIdx];
  if (!card) return null;

  const handleRate = async (rating: number) => {
    setSubmitting(true);
    await fetch(`/api/cards/${card.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    setRevealed(false);
    setSubmitting(false);
    if (currentIdx + 1 < dueCards.length) {
      setCurrentIdx(currentIdx + 1);
    } else {
      await onUpdate();
    }
  };

  const ratings = [
    { label: "Again", value: 1, color: "bg-red-600 hover:bg-red-700" },
    { label: "Hard", value: 2, color: "bg-orange-500 hover:bg-orange-600" },
    { label: "Good", value: 3, color: "bg-green-600 hover:bg-green-700" },
    { label: "Easy", value: 4, color: "bg-blue-600 hover:bg-blue-700" },
  ];

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4">
        {currentIdx + 1} / {dueCards.length} due
      </p>
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-6 max-w-xl">
        <p className="text-lg mb-4 whitespace-pre-wrap">{card.front}</p>
        {revealed ? (
          <>
            <hr className="my-4 border-neutral-200 dark:border-neutral-700" />
            <p className="text-lg mb-6 whitespace-pre-wrap">{card.back}</p>
            <div className="flex gap-2">
              {ratings.map((r) => (
                <button
                  key={r.value}
                  disabled={submitting}
                  onClick={() => handleRate(r.value)}
                  className={`px-4 py-2 text-sm text-white rounded ${r.color} disabled:opacity-50`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
          >
            Show Answer
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Cards Tab ── */

function CardsTab({
  cards,
  onUpdate,
}: {
  cards: StudyCard[];
  onUpdate: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <button
        onClick={() => { setAdding(true); setEditingId(null); }}
        className="mb-4 px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
      >
        + Add Card
      </button>

      {adding && (
        <CardForm
          onSave={async (front, back) => {
            await fetch("/api/cards", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ front, back }),
            });
            setAdding(false);
            await onUpdate();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {cards.length === 0 && !adding && (
        <p className="text-neutral-500">No cards yet.</p>
      )}

      <div className="space-y-2">
        {cards.map((card) =>
          editingId === card.id ? (
            <CardForm
              key={card.id}
              initialFront={card.front}
              initialBack={card.back}
              onSave={async (front, back) => {
                await fetch(`/api/cards/${card.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ front, back }),
                });
                setEditingId(null);
                await onUpdate();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={card.id}
              className="flex items-center justify-between border border-neutral-200 dark:border-neutral-700 rounded px-4 py-3"
            >
              <span className="truncate mr-4">{card.front}</span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { setEditingId(card.id); setAdding(false); }}
                  className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Delete this card?")) return;
                    await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
                    await onUpdate();
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

/* ── Card Form (inline add/edit) ── */

function CardForm({
  initialFront = "",
  initialBack = "",
  onSave,
  onCancel,
}: {
  initialFront?: string;
  initialBack?: string;
  onSave: (front: string, back: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    await onSave(front, back);
    setSaving(false);
  };

  return (
    <div className="border border-neutral-300 dark:border-neutral-600 rounded p-4 mb-2 max-w-xl">
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Front</label>
        <textarea
          value={front}
          onChange={(e) => setFront(e.target.value)}
          rows={2}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          placeholder="Question..."
        />
      </div>
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Back</label>
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={2}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          placeholder="Answer..."
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !front.trim() || !back.trim()}
          className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify in browser**

Open `http://localhost:5090/study`. Check:
- Tabs switch between Review and Cards
- Can add a card via the Cards tab
- Card appears in the list
- Can edit and delete cards
- Review tab shows due cards and rating buttons work

**Step 3: Commit**

```bash
git add src/app/study/page.tsx
git commit -m "feat(study): build Study page with Review and Cards tabs"
```

---

### Task 7: Manual smoke test and cleanup

**Step 1: Clean test data**

Reset `data/cards.json` to `[]` (remove any test cards from curl testing).

**Step 2: End-to-end walkthrough**

1. Go to `/study` — Review tab says "No cards yet"
2. Switch to Cards tab — empty, click "+ Add Card"
3. Add a card: front="Capital of France?", back="Paris"
4. Add another card: front="2+2?", back="4"
5. Switch to Review tab — both cards are due (new cards are due immediately)
6. Click "Show Answer" on first card, rate "Good"
7. Second card appears, rate "Easy"
8. "All caught up" message appears with next review time
9. Go back to Cards tab, edit one card, delete the other
10. Verify `data/cards.json` reflects the changes

**Step 3: Commit any fixes**

If anything needed fixing, commit the fixes.

---

### Task 8: Update PROGRESS.md and final commit

**Step 1: Update PROGRESS.md**

Check off all Phase 3 items (except "Import from Forest" which is deferred):
- [x] Install and integrate `ts-fsrs` library
- [x] Build JSON file storage layer for cards
- [x] Create card management UI (add/edit/delete cards)
- [x] Build review session UI (show due cards, rating buttons)
- [x] Implement FSRS scheduling on review
- [ ] Add "import from Forest" feature (deferred)

Update the status table: Phase 3 = Complete.

**Step 2: Commit and merge**

```bash
git add PROGRESS.md
git commit -m "docs: mark Phase 3 (Study/FSRS) as complete"

git checkout master
git merge task/study-fsrs-phase3
git branch -d task/study-fsrs-phase3
```
