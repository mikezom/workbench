"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PageContainer from "@/components/page-container";

interface ClipboardItem {
  id: string;
  content: string;
  language: string | null;
  created_at: string;
}

export default function ClipboardPage() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newLanguage, setNewLanguage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  const [displayCount, setDisplayCount] = useState(10);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/clipboard");
    const data = await res.json();
    setItems(data);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    await fetch("/api/clipboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: newContent,
        language: newLanguage.trim() || undefined,
      }),
    });

    setNewContent("");
    setNewLanguage("");
    fetchItems();
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;

    await fetch(`/api/clipboard/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: editContent,
        language: editLanguage.trim() || undefined,
      }),
    });

    setEditingId(null);
    setEditContent("");
    setEditLanguage("");
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId === id) {
      // Second click - actually delete
      await fetch(`/api/clipboard/${id}`, {
        method: "DELETE",
      });

      setConfirmDeleteId(null);
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      fetchItems();
    } else {
      // First click - enter confirm mode
      setConfirmDeleteId(id);

      // Auto-cancel after 3 seconds
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmDeleteId(null);
      }, 3000);
    }
  };

  const handleCopy = async (content: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        setCopyFeedback(id);
        setTimeout(() => setCopyFeedback(null), 2000);
      } else {
        // Fallback for browsers without Clipboard API
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopyFeedback(id);
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("Failed to copy to clipboard. Please copy manually.");
    }
  };

  const startEdit = (item: ClipboardItem) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditLanguage(item.language || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
    setEditLanguage("");
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < items.length) {
          setDisplayCount((prev) => prev + 10);
        }
      },
      { threshold: 1.0 }
    );

    if (listEndRef.current) {
      observer.observe(listEndRef.current);
    }

    return () => {
      observer.disconnect();
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, [displayCount, items.length]);

  const displayedItems = items.slice(0, displayCount);

  return (
    <PageContainer title="Clipboard">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Create Form */}
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter your snippet..."
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 resize-y min-h-[100px]"
              required
            />
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              placeholder="Language (optional)"
              className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Add Snippet
            </button>
          </div>
        </form>

        {/* Snippets List */}
        <div className="space-y-4">
          {displayedItems.map((item) => (
            <div
              key={item.id}
              className="border border-neutral-300 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800"
            >
              {editingId === item.id ? (
                // Edit Mode
                <div className="space-y-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 resize-y min-h-[100px]"
                  />
                  <input
                    type="text"
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value)}
                    placeholder="Language (optional)"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(item.id)}
                      className="px-3 py-1.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="space-y-3">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-neutral-900 dark:text-neutral-100 break-words">
                    {item.content}
                  </pre>
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <div className="flex items-center gap-3">
                      {item.language && (
                        <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 rounded">
                          {item.language}
                        </span>
                      )}
                      <span>
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(item.content, item.id)}
                        className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        {copyFeedback === item.id ? "Copied!" : "Copy"}
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className={`px-3 py-1.5 border rounded text-sm transition-all duration-300 ${
                          confirmDeleteId === item.id
                            ? "bg-red-600 dark:bg-red-600 border-red-600 dark:border-red-600 text-white dark:text-white"
                            : "border-neutral-300 dark:border-neutral-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        }`}
                      >
                        {confirmDeleteId === item.id ? "Confirm?" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Infinite Scroll Trigger */}
        {displayCount < items.length && (
          <div ref={listEndRef} className="h-4 flex items-center justify-center">
            <span className="text-sm text-neutral-400 dark:text-neutral-500">
              Loading more...
            </span>
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
            No snippets yet. Add your first snippet above.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
