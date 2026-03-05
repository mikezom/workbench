"use client";

import { useState, useEffect } from "react";

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

interface Jin10NewsItem {
  id: string;
  title: string;
  timestamp: string;
  summary?: string;
  link?: string;
}

/* ------------------------------------------------------------------ */
/*  ArxivPanel                                                         */
/* ------------------------------------------------------------------ */

function ArxivPanel() {
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("cat:cs.*");

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

  // Auto-fetch on mount to show recent papers
  useEffect(() => {
    fetchPapers();
  }, []);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full min-h-0">
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
            placeholder="Search query (default: all recent CS papers)"
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
      <div className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent hover:scrollbar-thumb-neutral-400 dark:hover:scrollbar-thumb-neutral-500">
        <style>{`
          .scrollbar-thin::-webkit-scrollbar {
            width: 6px;
          }
          .scrollbar-thin::-webkit-scrollbar-track {
            background: transparent;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb {
            border-radius: 3px;
            background-color: rgb(212 212 212);
          }
          .dark .scrollbar-thin::-webkit-scrollbar-thumb {
            background-color: rgb(82 82 82);
          }
          .scrollbar-thin:hover::-webkit-scrollbar-thumb {
            background-color: rgb(163 163 163);
          }
          .dark .scrollbar-thin:hover::-webkit-scrollbar-thumb {
            background-color: rgb(107 107 107);
          }
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background-color: rgb(120 120 120);
          }
          .dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background-color: rgb(156 163 175);
          }
        `}</style>
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
/*  Jin10Panel                                                         */
/* ------------------------------------------------------------------ */

function Jin10Panel() {
  const [news, setNews] = useState<Jin10NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/crawl/jin10");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to fetch news: ${response.status}`);
      }

      const data = await response.json();
      setNews(data);
    } catch (error) {
      console.error("Failed to fetch Jin10 news:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setNews([]);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full min-h-0">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          JIN10 NEWS
        </span>
        {news.length > 0 && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            ({news.length})
          </span>
        )}
      </div>

      {/* Refresh Button */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={fetchNews}
          disabled={loading}
          className="w-full px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* News List */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent hover:scrollbar-thumb-neutral-400 dark:hover:scrollbar-thumb-neutral-500">
        <style>{`
          .scrollbar-thin::-webkit-scrollbar {
            width: 6px;
          }
          .scrollbar-thin::-webkit-scrollbar-track {
            background: transparent;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb {
            border-radius: 3px;
            background-color: rgb(212 212 212);
          }
          .dark .scrollbar-thin::-webkit-scrollbar-thumb {
            background-color: rgb(82 82 82);
          }
          .scrollbar-thin:hover::-webkit-scrollbar-thumb {
            background-color: rgb(163 163 163);
          }
          .dark .scrollbar-thin:hover::-webkit-scrollbar-thumb {
            background-color: rgb(107 107 107);
          }
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background-color: rgb(120 120 120);
          }
          .dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background-color: rgb(156 163 175);
          }
        `}</style>
        {news.length === 0 && !loading && (
          <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
            Click Refresh to load latest news
          </p>
        )}
        {news.map((item) => (
          <div
            key={item.id}
            className="border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 space-y-2"
          >
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              {item.title}
            </h3>
            {item.summary && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300 line-clamp-3">
                {item.summary}
              </p>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                {new Date(item.timestamp).toLocaleString()}
              </span>
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 dark:text-orange-400 hover:underline"
                >
                  →
                </a>
              )}
            </div>
          </div>
        ))}
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
        <Jin10Panel />
        <LobstersPanel />
        <NLabPanel />
        <PlanetHaskellPanel />
        <RedditPanel />
      </div>
    </div>
  );
}
