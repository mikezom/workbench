"use client";

import { LatexRenderer } from "@/components/latex-renderer";

interface MessageBubbleProps {
  type: "user" | "assistant";
  content: string;
  agentAvatar?: string;
  userAvatar?: string;
}

export function MessageBubble({
  type,
  content,
  agentAvatar,
  userAvatar,
}: MessageBubbleProps) {
  const isUser = type === "user";

  const avatarSrc = isUser ? userAvatar : agentAvatar;
  const fallbackInitial = isUser ? "U" : "A";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4`}
    >
      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={isUser ? "User" : "Agent"}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initial on load error
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <span
          className={`text-xs font-medium text-neutral-500 dark:text-neutral-400 ${avatarSrc ? "hidden" : ""}`}
        >
          {fallbackInitial}
        </span>
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-blue-500 text-white rounded-br-md"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-bl-md"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="text-sm">
            <LatexRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
