"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FSRSData {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

interface StudyCard {
  id: string;
  front: string;
  back: string;
  title?: string;
  definition?: string;
  example?: string;
  source: string | null;
  group_id: string | null;
  scheduled_at: string;
  fsrs: FSRSData;
  created_at: string;
  updated_at: string;
}

interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  settings: {
    dailyNewLimit: number;
    dailyReviewLimit: number;
    rolloverHour: number;
  };
  created_at: string;
}

type Tab = "review" | "cards" | "settings";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get all descendant group IDs (including the given id itself). */
function getDescendantIds(groupId: string, groups: Group[]): string[] {
  const result: string[] = [groupId];
  const queue = [groupId];
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

/** Build a tree structure from flat groups for rendering. */
function buildTree(groups: Group[]): Array<Group & { depth: number }> {
  const result: Array<Group & { depth: number }> = [];
  const visited = new Set<string>();

  function addChildren(parentId: string | null, depth: number) {
    for (const g of groups) {
      if (g.parent_id === parentId && !visited.has(g.id)) {
        visited.add(g.id);
        result.push({ ...g, depth });
        addChildren(g.id, depth + 1);
      }
    }
  }

  addChildren(null, 0);

  // Add any orphaned groups (parent not found)
  for (const g of groups) {
    if (!visited.has(g.id)) {
      visited.add(g.id);
      result.push({ ...g, depth: 0 });
      addChildren(g.id, 1);
    }
  }

  return result;
}

/** Strip HTML tags for truncated display. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/* ------------------------------------------------------------------ */
/*  GroupTree component                                                */
/* ------------------------------------------------------------------ */

function GroupTree({
  groups,
  cards,
  selectedId,
  onSelect,
}: {
  groups: Group[];
  cards?: StudyCard[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const tree = useMemo(() => buildTree(groups), [groups]);

  const countForGroup = useCallback(
    (groupId: string | null) => {
      if (!cards) return null;
      if (groupId === null) return cards.length;
      const descendants = getDescendantIds(groupId, groups);
      return cards.filter(
        (c) => c.group_id !== null && descendants.includes(c.group_id)
      ).length;
    },
    [cards, groups]
  );

  const baseClass =
    "w-full text-left px-3 py-1.5 text-sm rounded transition-colors ";
  const activeClass =
    "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium";
  const inactiveClass =
    "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
      <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide px-1 py-1 mb-1">
        Groups
      </p>
      <button
        onClick={() => onSelect(null)}
        className={`${baseClass} ${selectedId === null ? activeClass : inactiveClass}`}
      >
        All Cards
        {cards && (
          <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">
            ({countForGroup(null)})
          </span>
        )}
      </button>
      {tree.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className={`${baseClass} ${selectedId === g.id ? activeClass : inactiveClass}`}
          style={{ paddingLeft: `${12 + g.depth * 16}px` }}
        >
          {g.name}
          {cards && (
            <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">
              ({countForGroup(g.id)})
            </span>
          )}
        </button>
      ))}
      {groups.length === 0 && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 px-3 py-1">
          No groups yet
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ReviewTab                                                          */
/* ------------------------------------------------------------------ */

function ReviewTab({
  cards,
  selectedGroupId,
  onUpdate,
}: {
  cards: StudyCard[];
  selectedGroupId: string | null;
  onUpdate: () => Promise<void>;
}) {
  const [immediateQueue, setImmediateQueue] = useState<StudyCard[]>([]);
  const [delayedCards, setDelayedCards] = useState<
    Array<{ card: StudyCard; availableAt: Date }>
  >([]);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [nextRollover, setNextRollover] = useState<Date | null>(null);
  const [budgetInfo, setBudgetInfo] = useState<{
    newUsed: number;
    newLimit: number;
    reviewUsed: number;
    reviewLimit: number;
    newAvailable: number;
    reviewAvailable: number;
  } | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived state
  const card = immediateQueue[0] ?? null;
  const isWaiting = !card && delayedCards.length > 0;
  const isComplete = sessionStarted && !card && delayedCards.length === 0;

  // Promote delayed cards whose availableAt has passed
  const promoteDelayed = useCallback(() => {
    const now = new Date();
    const ready: StudyCard[] = [];
    const stillWaiting: Array<{ card: StudyCard; availableAt: Date }> = [];

    for (const entry of delayedCards) {
      if (entry.availableAt <= now) {
        ready.push(entry.card);
      } else {
        stillWaiting.push(entry);
      }
    }

    if (ready.length > 0) {
      setImmediateQueue((prev) => [...prev, ...ready]);
      setDelayedCards(stillWaiting);
    }

    // Update countdown for earliest still-waiting card
    if (stillWaiting.length > 0) {
      const earliest = stillWaiting.reduce((a, b) =>
        a.availableAt < b.availableAt ? a : b
      );
      const diffMs = earliest.availableAt.getTime() - now.getTime();
      if (diffMs <= 0) {
        setCountdown("0:00");
      } else {
        const totalSec = Math.ceil(diffMs / 1000);
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        setCountdown(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
    } else {
      setCountdown(null);
    }
  }, [delayedCards]);

  // Start session: fetch from /api/cards/session
  const startSession = useCallback(async () => {
    const url = selectedGroupId
      ? `/api/cards/session?group_id=${encodeURIComponent(selectedGroupId)}`
      : `/api/cards/session`;

    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      setImmediateQueue(data.cards);
      setNextRollover(new Date(data.nextRollover));
      setBudgetInfo(data.budgetInfo);
      setDelayedCards([]);
      setRevealed(false);
      setTotalReviewed(0);
      setCountdown(null);
      setSessionStarted(true);
    } catch {
      // ignore fetch errors
    }
  }, [selectedGroupId]);

  // Handle rating a card
  const handleRate = async (rating: number) => {
    if (!card || !nextRollover) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) {
        setSubmitting(false);
        return;
      }

      const result = await res.json();
      const scheduledAt = new Date(result.scheduledAt);

      // Remove current card from front of queue
      setImmediateQueue((prev) => prev.slice(1));
      setRevealed(false);
      setTotalReviewed((prev) => prev + 1);

      // If scheduled before nextRollover, it comes back today
      if (scheduledAt < nextRollover) {
        setDelayedCards((prev) => [
          ...prev,
          { card: result.card, availableAt: scheduledAt },
        ]);
      }
      // else: card is done for today — no action needed

      await onUpdate();
    } finally {
      setSubmitting(false);
    }
  };

  // Timer effect: when waiting for delayed cards, tick every second
  useEffect(() => {
    if (isWaiting) {
      // Immediately check on entering waiting state
      promoteDelayed();

      timerRef.current = setInterval(() => {
        promoteDelayed();
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isWaiting, promoteDelayed]);

  // Reset when group changes
  useEffect(() => {
    setSessionStarted(false);
    setImmediateQueue([]);
    setDelayedCards([]);
    setBudgetInfo(null);
    setNextRollover(null);
    setCountdown(null);
    setTotalReviewed(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [selectedGroupId]);

  const ratings = [
    { label: "Again", value: 1, color: "bg-red-600 hover:bg-red-700" },
    { label: "Hard", value: 2, color: "bg-orange-500 hover:bg-orange-600" },
    { label: "Good", value: 3, color: "bg-green-600 hover:bg-green-700" },
    { label: "Easy", value: 4, color: "bg-blue-600 hover:bg-blue-700" },
  ];

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500">
          No cards yet. Add some in the Cards tab.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Centered content area */}
      <div className="flex-1 flex items-center justify-center">
        {!sessionStarted ? (
          <div>
            <button
              onClick={startSession}
              className="px-8 py-4 text-lg bg-black text-white border-2 border-white rounded-lg hover:bg-neutral-800"
            >
              Start Review
            </button>
          </div>
        ) : isComplete ? (
          <div className="text-neutral-500 text-center">
            <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              All caught up!
            </p>
            <p className="text-sm mb-2">{totalReviewed} cards reviewed</p>
            {budgetInfo && (
              <div className="text-sm space-y-1">
                <p>
                  New today: {budgetInfo.newUsed} / {budgetInfo.newLimit}
                </p>
                <p>
                  Reviews today: {budgetInfo.reviewUsed} /{" "}
                  {budgetInfo.reviewLimit}
                </p>
              </div>
            )}
          </div>
        ) : isWaiting ? (
          <div className="text-center">
            <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              Waiting for cards...
            </p>
            {countdown && (
              <p className="text-3xl font-mono text-neutral-600 dark:text-neutral-400 mb-2">
                {countdown}
              </p>
            )}
            <p className="text-sm text-neutral-500">
              {delayedCards.length} card{delayedCards.length !== 1 ? "s" : ""}{" "}
              coming back soon
            </p>
          </div>
        ) : card ? (
          <div className="w-full max-w-xl">
            {/* Card */}
            <div
              onClick={() => !revealed && setRevealed(true)}
              className={`border border-neutral-200 dark:border-neutral-700 rounded-lg p-6 ${!revealed ? "cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-500" : ""}`}
            >
              {card.title ? (
                /* Structured card: title / definition / example */
                <>
                  <h3 className="text-xl font-semibold mb-2">{card.title}</h3>
                  {!revealed && (
                    <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-4">
                      Click to reveal answer
                    </p>
                  )}
                  {revealed ? (
                    <>
                      <hr className="my-4 border-neutral-200 dark:border-neutral-700" />
                      <div className="mb-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                          Definition
                        </span>
                        <p className="mt-1 text-base leading-relaxed">
                          {card.definition}
                        </p>
                      </div>
                      {card.example && (
                        <div className="mt-4 bg-neutral-50 dark:bg-neutral-800/50 rounded p-3">
                          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                            Example
                          </span>
                          <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                            {card.example}
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2 mt-6">
                        {ratings.map((r) => (
                          <button
                            key={r.value}
                            disabled={submitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRate(r.value);
                            }}
                            className={`px-4 py-2 text-sm text-white rounded ${r.color} disabled:opacity-50`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                /* Legacy card: front / back (Anki imports) */
                <>
                  <div
                    className="text-lg mb-4 [&_img]:max-w-full [&_img]:h-auto"
                    dangerouslySetInnerHTML={{ __html: card.front }}
                  />
                  {!revealed && (
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">
                      Click to reveal answer
                    </p>
                  )}
                  {revealed ? (
                    <>
                      <hr className="my-4 border-neutral-200 dark:border-neutral-700" />
                      <div
                        className="text-lg mb-6 [&_img]:max-w-full [&_img]:h-auto"
                        dangerouslySetInnerHTML={{ __html: card.back }}
                      />
                      <div className="flex gap-2">
                        {ratings.map((r) => (
                          <button
                            key={r.value}
                            disabled={submitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRate(r.value);
                            }}
                            className={`px-4 py-2 text-sm text-white rounded ${r.color} disabled:opacity-50`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Progress info - bottom right */}
      {sessionStarted && !isComplete && (
        <div className="flex justify-end pt-2">
          <div className="text-xs text-neutral-400 dark:text-neutral-500 text-right space-y-0.5">
            <p>
              {immediateQueue.length} ready | {delayedCards.length} delayed
            </p>
            <p>{totalReviewed} reviewed</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardsTab                                                           */
/* ------------------------------------------------------------------ */

function CardsTab({
  cards,
  groups,
  selectedGroupId,
  onUpdate,
}: {
  cards: StudyCard[];
  groups: Group[];
  selectedGroupId: string | null;
  onUpdate: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter cards by selected group
  const filteredCards = useMemo(() => {
    if (selectedGroupId === null) return cards;
    const descendantIds = getDescendantIds(selectedGroupId, groups);
    return cards.filter(
      (c) => c.group_id !== null && descendantIds.includes(c.group_id)
    );
  }, [cards, groups, selectedGroupId]);

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import/anki", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setImportResult(`Import failed: ${err.error || "Unknown error"}`);
        return;
      }

      const result = await res.json();
      setImportResult(
        `Imported ${result.cardsCreated} cards in ${result.groupsCreated} groups`
      );
      await onUpdate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setImportResult(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
        >
          + Add Card
        </button>

        <label className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer inline-flex items-center gap-1">
          {importing ? "Importing..." : "Import Anki (.apkg)"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".apkg"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
          />
        </label>
      </div>

      {importResult && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            importResult.startsWith("Import failed")
              ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
              : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
          }`}
        >
          {importResult}
          <button
            onClick={() => setImportResult(null)}
            className="ml-2 underline"
          >
            dismiss
          </button>
        </div>
      )}

      {adding && (
        <CardForm
          groups={groups}
          onSave={async ({ title, definition, example, groupId }) => {
            await fetch("/api/cards", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, definition, example, front: title, back: definition, group_id: groupId }),
            });
            setAdding(false);
            await onUpdate();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {filteredCards.length === 0 && !adding && (
        <p className="text-neutral-500">
          No cards{selectedGroupId ? " in this group" : " yet"}.
        </p>
      )}

      <div className="space-y-2">
        {filteredCards.map((card) =>
          editingId === card.id ? (
            <CardForm
              key={card.id}
              initialTitle={card.title || card.front}
              initialDefinition={card.definition || card.back}
              initialExample={card.example || ""}
              initialGroupId={card.group_id}
              groups={groups}
              onSave={async ({ title, definition, example, groupId }) => {
                await fetch(`/api/cards/${card.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, definition, example, front: title, back: definition, group_id: groupId }),
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
              <div className="truncate mr-4 flex-1 min-w-0">
                <span className="truncate block">
                  {(card.title || stripHtml(card.front)).slice(0, 80) || "(empty)"}
                </span>
                {card.group_id && (
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {groups.find((g) => g.id === card.group_id)?.name ?? "Unknown group"}
                  </span>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    setEditingId(card.id);
                    setAdding(false);
                  }}
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

/* ------------------------------------------------------------------ */
/*  CardForm                                                           */
/* ------------------------------------------------------------------ */

function CardForm({
  initialTitle = "",
  initialDefinition = "",
  initialExample = "",
  initialGroupId = null,
  groups,
  onSave,
  onCancel,
}: {
  initialTitle?: string;
  initialDefinition?: string;
  initialExample?: string;
  initialGroupId?: string | null;
  groups: Group[];
  onSave: (data: { title: string; definition: string; example: string; groupId: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [definition, setDefinition] = useState(initialDefinition);
  const [example, setExample] = useState(initialExample);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !definition.trim()) return;
    setSaving(true);
    await onSave({ title, definition, example, groupId });
    setSaving(false);
  };

  return (
    <div className="border border-neutral-300 dark:border-neutral-600 rounded p-4 mb-2 max-w-xl">
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          placeholder="Term or concept..."
        />
      </div>
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Definition</label>
        <textarea
          value={definition}
          onChange={(e) => setDefinition(e.target.value)}
          rows={3}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          placeholder="What it means..."
        />
      </div>
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Example <span className="text-neutral-400 font-normal">(optional)</span></label>
        <textarea
          value={example}
          onChange={(e) => setExample(e.target.value)}
          rows={2}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          placeholder="A concrete example..."
        />
      </div>
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Group</label>
        <select
          value={groupId ?? ""}
          onChange={(e) => setGroupId(e.target.value || null)}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
        >
          <option value="">No group</option>
          {buildTree(groups).map((g) => (
            <option key={g.id} value={g.id}>
              {"  ".repeat(g.depth) + g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim() || !definition.trim()}
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

/* ------------------------------------------------------------------ */
/*  SettingsTab                                                        */
/* ------------------------------------------------------------------ */

function SettingsTab({
  groups,
  onUpdate,
}: {
  groups: Group[];
  onUpdate: () => Promise<void>;
}) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupParent, setNewGroupParent] = useState<string | null>(null);
  const [savingNewGroup, setSavingNewGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(groups), [groups]);

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    setSavingNewGroup(true);
    try {
      await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          parent_id: newGroupParent,
        }),
      });
      setNewGroupName("");
      setNewGroupParent(null);
      setAddingGroup(false);
      await onUpdate();
    } finally {
      setSavingNewGroup(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">Groups</h2>
        <button
          onClick={() => setAddingGroup(true)}
          className="px-3 py-1.5 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
        >
          + Add Group
        </button>
      </div>

      {addingGroup && (
        <div className="border border-neutral-300 dark:border-neutral-600 rounded p-4 mb-4 max-w-md">
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Group Name</label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              placeholder="e.g., Mathematics"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              Parent Group (optional)
            </label>
            <select
              value={newGroupParent ?? ""}
              onChange={(e) => setNewGroupParent(e.target.value || null)}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
            >
              <option value="">None (top-level)</option>
              {tree.map((g) => (
                <option key={g.id} value={g.id}>
                  {"  ".repeat(g.depth) + g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddGroup}
              disabled={savingNewGroup || !newGroupName.trim()}
              className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
            >
              {savingNewGroup ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => setAddingGroup(false)}
              className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && !addingGroup && (
        <p className="text-neutral-500">
          No groups yet. Create one or import an Anki deck.
        </p>
      )}

      <div className="space-y-2 max-w-lg">
        {tree.map((g) =>
          editingGroupId === g.id ? (
            <GroupSettingsEditor
              key={g.id}
              group={g}
              depth={g.depth}
              onSave={async (name, settings) => {
                await fetch(`/api/groups/${g.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, settings }),
                });
                setEditingGroupId(null);
                await onUpdate();
              }}
              onCancel={() => setEditingGroupId(null)}
            />
          ) : (
            <div
              key={g.id}
              className="flex items-center justify-between border border-neutral-200 dark:border-neutral-700 rounded px-4 py-3"
              style={{ marginLeft: `${g.depth * 16}px` }}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{g.name}</span>
                <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
                  New: {g.settings.dailyNewLimit} / Review: {g.settings.dailyReviewLimit} / Rollover: {g.settings.rolloverHour}:00
                </span>
              </div>
              <div className="flex gap-2 shrink-0 ml-3">
                <button
                  onClick={() => setEditingGroupId(g.id)}
                  className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Edit
                </button>
                <button
                  onClick={async () => {
                    const descendantIds = getDescendantIds(g.id, groups);
                    const childCount = descendantIds.length - 1;
                    const msg = childCount > 0
                      ? `Delete group "${g.name}", its ${childCount} subgroup(s), and all their cards?`
                      : `Delete group "${g.name}" and all its cards?`;
                    if (!confirm(msg)) return;
                    await fetch(`/api/groups/${g.id}`, { method: "DELETE" });
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

/* ------------------------------------------------------------------ */
/*  GroupSettingsEditor                                                 */
/* ------------------------------------------------------------------ */

function GroupSettingsEditor({
  group,
  depth,
  onSave,
  onCancel,
}: {
  group: Group;
  depth: number;
  onSave: (
    name: string,
    settings: { dailyNewLimit: number; dailyReviewLimit: number; rolloverHour: number }
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [dailyNewLimit, setDailyNewLimit] = useState(
    group.settings.dailyNewLimit
  );
  const [dailyReviewLimit, setDailyReviewLimit] = useState(
    group.settings.dailyReviewLimit
  );
  const [rolloverHour, setRolloverHour] = useState(group.settings.rolloverHour ?? 5);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), { dailyNewLimit, dailyReviewLimit, rolloverHour });
    setSaving(false);
  };

  return (
    <div
      className="border border-neutral-300 dark:border-neutral-600 rounded p-4"
      style={{ marginLeft: `${depth * 16}px` }}
    >
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
        />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            Daily New Limit
          </label>
          <input
            type="number"
            min={0}
            value={dailyNewLimit}
            onChange={(e) => setDailyNewLimit(parseInt(e.target.value) || 0)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Daily Review Limit
          </label>
          <input
            type="number"
            min={0}
            value={dailyReviewLimit}
            onChange={(e) =>
              setDailyReviewLimit(parseInt(e.target.value) || 0)
            }
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Day Rollover Hour</label>
          <input
            type="number"
            min={0}
            max={23}
            value={rolloverHour}
            onChange={(e) => setRolloverHour(parseInt(e.target.value) || 0)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
          <p className="text-xs text-neutral-400 mt-1">Hour (0-23) when a new study day begins</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
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

/* ------------------------------------------------------------------ */
/*  Main StudyPage                                                     */
/* ------------------------------------------------------------------ */

export default function StudyPage() {
  const [tab, setTab] = useState<Tab>("review");
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [cardsRes, groupsRes] = await Promise.all([
        fetch("/api/cards"),
        fetch("/api/groups"),
      ]);
      const [cardsData, groupsData] = await Promise.all([
        cardsRes.json(),
        groupsRes.json(),
      ]);
      setCards(cardsData);
      setGroups(groupsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "review", label: "Review" },
    { key: "cards", label: "Cards" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-48 shrink-0 border-r border-neutral-200 dark:border-neutral-700 p-4 flex flex-col">
        <h1 className="text-lg font-bold mb-4">Study</h1>
        <nav className="space-y-1 mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                tab === t.key
                  ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Group selector in sidebar */}
        {!loading && (
          <GroupTree
            groups={groups}
            cards={cards}
            selectedId={selectedGroupId}
            onSelect={setSelectedGroupId}
          />
        )}
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-auto p-6 flex flex-col">
        {loading ? (
          <p className="text-neutral-500">Loading...</p>
        ) : tab === "review" ? (
          <ReviewTab cards={cards} selectedGroupId={selectedGroupId} onUpdate={fetchData} />
        ) : tab === "cards" ? (
          <CardsTab cards={cards} groups={groups} selectedGroupId={selectedGroupId} onUpdate={fetchData} />
        ) : (
          <SettingsTab groups={groups} onUpdate={fetchData} />
        )}
      </div>
    </div>
  );
}
