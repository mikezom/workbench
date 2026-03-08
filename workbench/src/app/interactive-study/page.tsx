"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SessionSidebar } from "@/components/study/session-sidebar";
import { ChatInterface } from "@/components/study/chat-interface";

interface Session {
  id: number;
  title: string;
  status: string;
  prompt: string;
  created_at: string;
}

interface Message {
  id: number;
  type: "user" | "assistant";
  content: string;
  timestamp: string;
}

const POLL_INTERVAL = 2000; // 2 seconds

export default function InteractiveStudyPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionStatus, setActiveSessionStatus] = useState<string>("waiting_for_dev");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<number>(0);

  // Fetch sessions list
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/interactive-study/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // Silently retry on next poll
    }
  }, []);

  // Fetch messages for active session
  const fetchMessages = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      const res = await fetch(
        `/api/interactive-study/sessions/${activeSessionId}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setActiveSessionStatus(data.status);

        if (data.messages.length > 0) {
          lastMessageIdRef.current = data.messages[data.messages.length - 1].id;
        }
      }
    } catch {
      // Silently retry on next poll
    }
  }, [activeSessionId]);

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Poll for messages when session is active
  useEffect(() => {
    if (!activeSessionId) return;

    fetchMessages();

    pollRef.current = setInterval(() => {
      fetchMessages();
      fetchSessions(); // Also refresh session list for status dots
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeSessionId, fetchMessages, fetchSessions]);

  // Create new session
  const handleNewSession = useCallback(async () => {
    try {
      const res = await fetch("/api/interactive-study/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Study Session — ${new Date().toLocaleDateString()}`,
        }),
      });
      if (res.ok) {
        const session = await res.json();
        await fetchSessions();
        setActiveSessionId(session.id);
        setMessages([]);
        lastMessageIdRef.current = 0;
        setError(null);
      }
    } catch {
      setError("Failed to create session");
    }
  }, [fetchSessions]);

  // Select session
  const handleSelectSession = useCallback((id: number) => {
    setActiveSessionId(id);
    setMessages([]);
    lastMessageIdRef.current = 0;
    setError(null);
  }, []);

  // Delete session
  const handleDeleteSession = useCallback(async (id: number) => {
    try {
      await fetch(`/api/interactive-study/sessions/${id}`, {
        method: "DELETE",
      });
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      await fetchSessions();
    } catch {
      setError("Failed to delete session");
    }
  }, [activeSessionId, fetchSessions]);

  // Send message
  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeSessionId) return;
    setError(null);

    try {
      const res = await fetch(
        `/api/interactive-study/sessions/${activeSessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      if (res.ok) {
        // Immediately show user message
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(), // Temporary ID until next poll
            type: "user" as const,
            content,
            timestamp: new Date().toISOString(),
          },
        ]);
        setActiveSessionStatus("developing");
        // Fetch will pick up the real message + status on next poll
      } else {
        const data = await res.json();
        setError(data.error || "Failed to send message");
      }
    } catch {
      setError("Failed to send message");
    }
  }, [activeSessionId]);

  return (
    <div className="flex h-[calc(100vh-0px)] portrait:h-[calc(100vh-60px)]">
      {/* Session sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              dismiss
            </button>
          </div>
        )}

        <ChatInterface
          sessionId={activeSessionId}
          sessionStatus={activeSessionStatus}
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}
