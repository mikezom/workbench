"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PageContainer from "@/components/page-container";

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
  source: string | null;
  group_id: string | null;
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
  };
  created_at: string;
}

interface DayGroupLog {
  new: number;
  review: number;
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
    <div className="mb-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 max-w-xs">
      <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide px-3 py-1">
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
  groups,
  onUpdate,
}: {
  cards: StudyCard[];
  groups: Group[];
  onUpdate: () => Promise<void>;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sessionCards, setSessionCards] = useState<StudyCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [budgetInfo, setBudgetInfo] = useState<{
    newUsed: number;
    newLimit: number;
    reviewUsed: number;
    reviewLimit: number;
    newAvailable: number;
    reviewAvailable: number;
  } | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  // Build session cards when group selected
  const startSession = useCallback(async () => {
    const now = new Date();

    // Filter due cards for selected group
    let dueCards: StudyCard[];
    if (selectedGroupId === null) {
      dueCards = cards.filter((c) => new Date(c.fsrs.due) <= now);
    } else {
      const descendantIds = getDescendantIds(selectedGroupId, groups);
      dueCards = cards.filter(
        (c) =>
          new Date(c.fsrs.due) <= now &&
          c.group_id !== null &&
          descendantIds.includes(c.group_id)
      );
    }

    // Separate new vs review
    const newCards = dueCards.filter((c) => c.fsrs.state === 0);
    const reviewCards = dueCards.filter((c) => c.fsrs.state > 0);

    // Get limits from group settings (or defaults if "All Cards")
    let dailyNewLimit = 20;
    let dailyReviewLimit = 100;
    if (selectedGroup) {
      dailyNewLimit = selectedGroup.settings.dailyNewLimit;
      dailyReviewLimit = selectedGroup.settings.dailyReviewLimit;
    }

    // Fetch study log for this group
    let log: DayGroupLog = { new: 0, review: 0 };
    if (selectedGroupId) {
      try {
        const res = await fetch(
          `/api/study-log?group_id=${encodeURIComponent(selectedGroupId)}`
        );
        if (res.ok) {
          log = await res.json();
        }
      } catch {
        // use defaults
      }
    }

    // Apply limits
    const newRemaining = Math.max(0, dailyNewLimit - log.new);
    const reviewRemaining = Math.max(0, dailyReviewLimit - log.review);

    const limitedNew = newCards.slice(0, newRemaining);
    const limitedReview = reviewCards.slice(0, reviewRemaining);

    setBudgetInfo({
      newUsed: log.new,
      newLimit: dailyNewLimit,
      reviewUsed: log.review,
      reviewLimit: dailyReviewLimit,
      newAvailable: limitedNew.length,
      reviewAvailable: limitedReview.length,
    });

    // Combine: new cards first, then reviews
    const combined = [...limitedNew, ...limitedReview];
    setSessionCards(combined);
    setCurrentIdx(0);
    setRevealed(false);
    setSessionStarted(true);
  }, [cards, groups, selectedGroupId, selectedGroup]);

  // Auto-start when group changes
  useEffect(() => {
    setSessionStarted(false);
    setSessionCards([]);
    setBudgetInfo(null);
  }, [selectedGroupId]);

  const card = sessionCards[currentIdx];

  const handleRate = async (rating: number) => {
    if (!card) return;
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
      setRevealed(false);
      if (currentIdx + 1 < sessionCards.length) {
        setCurrentIdx(currentIdx + 1);
      } else {
        // Session complete
        await onUpdate();
        setSessionStarted(false);
        setSessionCards([]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const ratings = [
    { label: "Again", value: 1, color: "bg-red-600 hover:bg-red-700" },
    { label: "Hard", value: 2, color: "bg-orange-500 hover:bg-orange-600" },
    { label: "Good", value: 3, color: "bg-green-600 hover:bg-green-700" },
    { label: "Easy", value: 4, color: "bg-blue-600 hover:bg-blue-700" },
  ];

  if (cards.length === 0) {
    return (
      <p className="text-neutral-500">
        No cards yet. Add some in the Cards tab.
      </p>
    );
  }

  return (
    <div>
      <GroupTree
        groups={groups}
        cards={cards}
        selectedId={selectedGroupId}
        onSelect={setSelectedGroupId}
      />

      {!sessionStarted ? (
        <div>
          <button
            onClick={startSession}
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
          >
            Start Review
          </button>
        </div>
      ) : sessionCards.length === 0 ? (
        <div className="text-neutral-500">
          <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
            All caught up!
          </p>
          {budgetInfo && (
            <div className="text-sm space-y-1">
              <p>
                New today: {budgetInfo.newUsed} / {budgetInfo.newLimit}
              </p>
              <p>
                Reviews today: {budgetInfo.reviewUsed} / {budgetInfo.reviewLimit}
              </p>
            </div>
          )}
          {selectedGroupId === null && (
            <p className="mt-2 text-sm">
              Next review:{" "}
              {(() => {
                const sorted = [...cards].sort(
                  (a, b) =>
                    new Date(a.fsrs.due).getTime() -
                    new Date(b.fsrs.due).getTime()
                );
                return new Date(sorted[0].fsrs.due).toLocaleString();
              })()}
            </p>
          )}
        </div>
      ) : card ? (
        <div>
          {/* Progress info */}
          <div className="mb-4 text-sm text-neutral-500 space-y-1">
            <p>
              {currentIdx + 1} / {sessionCards.length} remaining
            </p>
            {budgetInfo && (
              <p>
                New: {budgetInfo.newUsed}/{budgetInfo.newLimit} | Review:{" "}
                {budgetInfo.reviewUsed}/{budgetInfo.reviewLimit}
              </p>
            )}
          </div>

          {/* Card */}
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-6 max-w-xl">
            <div
              className="text-lg mb-4 [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: card.front }}
            />
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
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardsTab                                                           */
/* ------------------------------------------------------------------ */

function CardsTab({
  cards,
  groups,
  onUpdate,
}: {
  cards: StudyCard[];
  groups: Group[];
  onUpdate: () => Promise<void>;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
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
      formData.append("notesPerDeck", "10");

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
      <GroupTree
        groups={groups}
        cards={cards}
        selectedId={selectedGroupId}
        onSelect={setSelectedGroupId}
      />

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
          onSave={async (front, back, groupId) => {
            await fetch("/api/cards", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ front, back, group_id: groupId }),
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
              initialFront={card.front}
              initialBack={card.back}
              initialGroupId={card.group_id}
              groups={groups}
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
              <div className="truncate mr-4 flex-1 min-w-0">
                <span className="truncate block">
                  {stripHtml(card.front).slice(0, 80) ||
                    "(empty)"}
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
  initialFront = "",
  initialBack = "",
  initialGroupId = null,
  groups,
  onSave,
  onCancel,
}: {
  initialFront?: string;
  initialBack?: string;
  initialGroupId?: string | null;
  groups: Group[];
  onSave: (front: string, back: string, groupId: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    await onSave(front, back, groupId);
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
                  New: {g.settings.dailyNewLimit} / Review:{" "}
                  {g.settings.dailyReviewLimit}
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
                    if (!confirm(`Delete group "${g.name}"?`)) return;
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
    settings: { dailyNewLimit: number; dailyReviewLimit: number }
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), { dailyNewLimit, dailyReviewLimit });
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
      <div className="grid grid-cols-2 gap-3 mb-3">
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

  const tabs: Tab[] = ["review", "cards", "settings"];

  return (
    <PageContainer title="Study">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-neutral-700">
        {tabs.map((t) => (
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
        <ReviewTab cards={cards} groups={groups} onUpdate={fetchData} />
      ) : tab === "cards" ? (
        <CardsTab cards={cards} groups={groups} onUpdate={fetchData} />
      ) : (
        <SettingsTab groups={groups} onUpdate={fetchData} />
      )}
    </PageContainer>
  );
}
