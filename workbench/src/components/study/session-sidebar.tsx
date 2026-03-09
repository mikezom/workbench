"use client";

interface Session {
  id: number;
  title: string;
  status: string;
  created_at: string;
}

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: SessionSidebarProps) {
  return (
    <div className="w-60 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={onNewSession}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          + New Session
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sessions.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 p-3 text-center">
            No sessions yet
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-1 px-3 py-2.5 cursor-pointer border-b border-neutral-100 dark:border-neutral-800/50 transition-colors ${
                session.id === activeSessionId
                  ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800/30 border-l-2 border-l-transparent"
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {session.title}
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {new Date(session.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Status indicator */}
              {session.status === "finished" ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-green-500 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ) : (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    session.status === "developing"
                      ? "bg-blue-400 animate-pulse"
                      : session.status === "failed"
                      ? "bg-red-400"
                      : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                />
              )}

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-all text-xs p-0.5"
                title="Delete session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
