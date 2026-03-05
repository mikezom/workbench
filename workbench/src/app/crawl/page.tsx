"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  link: string;
}

/* ------------------------------------------------------------------ */
/*  ArxivPanel                                                         */
/* ------------------------------------------------------------------ */

function ArxivPanel() {
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("cat:cs.AI");

  const fetchPapers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crawl/arxiv?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to fetch papers: ${response.status}`);
      }

      const data = await response.json();
      setPapers(data);
    } catch (error) {
      console.error("Failed to fetch papers:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Show error in UI by setting papers to empty and showing error state
      setPapers([]);
      // Could add error state here in the future
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          arXiv
        </span>
        {papers.length > 0 && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            ({papers.length})
          </span>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search query (e.g., cat:cs.AI)"
            className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
          />
          <button
            onClick={fetchPapers}
            disabled={loading}
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>
      </div>

      {/* Papers List */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {papers.length === 0 && !loading && (
          <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
            Enter a search query and click Search
          </p>
        )}
        {papers.map((paper) => (
          <div
            key={paper.id}
            className="border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 space-y-2"
          >
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              {paper.title}
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {paper.authors.join(", ")}
            </p>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 line-clamp-3">
              {paper.summary}
            </p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                {new Date(paper.published).toLocaleDateString()}
              </span>
              <a
                href={paper.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                View on arXiv →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HackerNewsPanel                                                    */
/* ------------------------------------------------------------------ */

function HackerNewsPanel() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Hacker News
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
          Coming soon
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LobstersPanel                                                      */
/* ------------------------------------------------------------------ */

function LobstersPanel() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Lobsters
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
          Coming soon
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NLabPanel                                                          */
/* ------------------------------------------------------------------ */

function NLabPanel() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          nLab
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
          Coming soon
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PlanetHaskellPanel                                                 */
/* ------------------------------------------------------------------ */

function PlanetHaskellPanel() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Planet Haskell
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
          Coming soon
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RedditPanel                                                        */
/* ------------------------------------------------------------------ */

function RedditPanel() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Reddit
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
          Coming soon
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CrawlPage() {
  return (
    <div className="flex flex-col h-full p-4 overflow-hidden bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Crawl</h1>
      </div>

      {/* Panel Grid */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        <ArxivPanel />
        <HackerNewsPanel />
        <LobstersPanel />
        <NLabPanel />
        <PlanetHaskellPanel />
        <RedditPanel />
      </div>
    </div>
  );
}
