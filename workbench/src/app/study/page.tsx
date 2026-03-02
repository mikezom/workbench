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

  useEffect(() => { setCurrentIdx(0); setRevealed(false); }, [dueCards.length]);

  if (cards.length === 0) {
    return <p className="text-neutral-500">No cards yet. Add some in the Cards tab.</p>;
  }

  if (dueCards.length === 0) {
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
