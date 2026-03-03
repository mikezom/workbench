import { NextRequest, NextResponse } from "next/server";
import { getAgentConfig, type AgentConfig } from "@/lib/agent-config";
import { readFileSync, existsSync } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt } = body;

  if (!prompt?.trim()) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400 }
    );
  }

  const config = getAgentConfig();
  if (!config.llm.api_key) {
    return NextResponse.json(
      { error: "LLM API key not configured. Set it in Agent settings." },
      { status: 422 }
    );
  }

  const claudeMdPath = path.join(process.cwd(), "data", "agent-decompose-claude.md");
  let systemPrompt: string;
  if (existsSync(claudeMdPath)) {
    systemPrompt = readFileSync(claudeMdPath, "utf-8");
  } else {
    systemPrompt = `You are a task decomposition assistant. Given a user's objective, break it down into atomic, independent sub-tasks that a coding agent can execute one at a time.

Rules:
- Each sub-task must be independently executable (no dependencies between tasks)
- Each sub-task should be small enough for a single focused coding session
- Each sub-task needs a clear, specific title and a detailed prompt
- Return valid JSON only — no markdown, no explanation outside the JSON

Return a JSON array of objects with "title" and "prompt" fields:
[
  {"title": "Short task title", "prompt": "Detailed description of what to implement..."},
  ...
]`;
  }

  try {
    const tasks = await callLLM(config, systemPrompt, prompt.trim());
    return NextResponse.json({ tasks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "LLM request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function callLLM(
  config: AgentConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<Array<{ title: string; prompt: string }>> {
  const { provider, model, api_key, base_url } = config.llm;

  let url: string;
  let headers: Record<string, string>;
  let body: unknown;

  if (provider === "anthropic") {
    url = `${base_url}/v1/messages`;
    headers = {
      "Content-Type": "application/json",
      "x-api-key": api_key,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    };
  } else {
    // OpenAI-compatible (OpenAI, OpenRouter, etc.)
    url = `${base_url}/v1/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${api_key}`,
    };
    body = {
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  // Extract text content from response
  let text: string;
  if (provider === "anthropic") {
    text = data.content?.[0]?.text ?? "";
  } else {
    text = data.choices?.[0]?.message?.content ?? "";
  }

  // Parse JSON from response (handle potential markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("LLM did not return a valid JSON array");
  }

  const tasks = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(tasks)) {
    throw new Error("LLM response is not an array");
  }

  return tasks.map((t: { title?: string; prompt?: string }) => ({
    title: t.title ?? "Untitled task",
    prompt: t.prompt ?? "",
  }));
}
