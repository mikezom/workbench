"use client";

import React, { useMemo } from "react";
import katex from "katex";

/**
 * Renders text content with LaTeX math expressions.
 *
 * Supports:
 * - Inline math: $...$ (rendered inline)
 * - Block math: $$...$$ (rendered as centered block)
 * - Basic markdown: **bold**, *italic*, `code`, \n for line breaks
 *
 * Invalid LaTeX is shown as raw text with a red underline.
 */
export function LatexRenderer({ content }: { content: string }) {
  const rendered = useMemo(() => renderContent(content), [content]);

  return (
    <div
      className="latex-content"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function renderContent(text: string): string {
  // Step 1: Escape HTML entities
  let html = escapeHtml(text);

  // Step 2: Process block LaTeX ($$...$$) first
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex) => {
    return renderKatex(unescapeHtml(latex), true);
  });

  // Step 3: Process inline LaTeX ($...$)
  // Avoid matching $$ (already processed) or currency like $5
  html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_match, latex) => {
    return renderKatex(unescapeHtml(latex), false);
  });

  // Step 4: Basic markdown
  // Code blocks (```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="bg-neutral-100 dark:bg-neutral-800 rounded p-3 my-2 overflow-x-auto text-sm"><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-neutral-100 dark:bg-neutral-800 rounded px-1.5 py-0.5 text-sm">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br />");

  return html;
}

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      errorColor: "#ef4444",
      trust: false,
    });
  } catch {
    // Fallback: show raw LaTeX with error styling
    const escaped = escapeHtml(latex);
    const wrapper = displayMode ? "div" : "span";
    return `<${wrapper} class="text-red-500 underline decoration-wavy" title="LaTeX parse error">${displayMode ? "$$" : "$"}${escaped}${displayMode ? "$$" : "$"}</${wrapper}>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
