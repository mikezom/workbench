"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { MessageBubble } from "./message-bubble";

interface Message {
  id: number;
  type: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatInterfaceProps {
  sessionId: number | null;
  sessionStatus: string;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onEndSession: () => void;
}

export function ChatInterface({
  sessionId,
  sessionStatus,
  messages,
  onSendMessage,
  onEndSession,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isProcessing = sessionStatus === "developing";
  const isFinished = sessionStatus === "finished";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        align: "end",
        behavior: "auto",
      });
    }
  }, [messages.length]);

  // Auto-resize textarea: expand up to 1/4 of panel height, then show scrollbar
  useEffect(() => {
    const textarea = textareaRef.current;
    const panel = panelRef.current;
    if (!textarea || !panel) return;

    const maxHeight = Math.floor(panel.clientHeight / 4);
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;

    if (scrollHeight <= maxHeight) {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = "hidden";
    } else {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = "auto";
    }
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing || !sessionId) return;
    onSendMessage(trimmed);
    setInput("");
  }, [input, isProcessing, sessionId, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-500">
        <div className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto mb-4 opacity-30">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-lg font-medium">Interactive Study</p>
          <p className="text-sm mt-1">Create a new session to start learning</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex-1 flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        {messages.length === 0 && !isProcessing ? (
          <div className="flex items-center justify-center h-full text-center text-neutral-400 dark:text-neutral-500">
            <p className="text-sm">Send a message to start the conversation</p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            className="custom-scrollbar"
            style={{ height: "100%" }}
            itemContent={(index, msg) => (
              <div className="px-4 py-2">
                <MessageBubble
                  key={msg.id}
                  type={msg.type as "user" | "assistant"}
                  content={msg.content}
                  userAvatar="/api/interactive-study/avatars/student.jpg"
                  agentAvatar="/api/interactive-study/avatars/teacher.png"
                />
              </div>
            )}
            components={{
              Footer: () => (
                <>
                  {/* Typing indicator */}
                  {isProcessing && (
                    <div className="flex gap-3 mb-4 px-4">
                      <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src="/api/interactive-study/avatars/teacher.png"
                          alt="Agent"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1.5">
                          <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ),
            }}
          />
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3">
        {isFinished ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-green-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span>Session ended</span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isProcessing ? "Waiting for response..." : "Type your message..."}
                disabled={isProcessing}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 custom-scrollbar"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className="shrink-0 w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:hover:bg-blue-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
              <button
                onClick={onEndSession}
                disabled={isProcessing}
                className="shrink-0 px-3 h-10 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                title="End session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                </svg>
                End
              </button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1.5 text-center">
              Shift+Enter for new line
            </p>
          </>
        )}
      </div>
    </div>
  );
}
