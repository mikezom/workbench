import { NextRequest, NextResponse } from "next/server";
import { getAgentConfig, saveAgentConfig } from "@/lib/agent-config";

/**
 * DEPRECATED: This config API is no longer used by the agent system.
 *
 * Both working agents and decompose agents use Claude Code CLI directly,
 * which handles authentication via the local Claude CLI configuration.
 *
 * These routes are kept for reference only and may be removed in future versions.
 */

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "***" : "";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

export function GET() {
  const config = getAgentConfig();
  return NextResponse.json({
    ...config,
    llm: {
      ...config.llm,
      api_key: maskKey(config.llm.api_key),
    },
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const existing = getAgentConfig();

  const updated = {
    llm: {
      provider: body.llm?.provider ?? existing.llm.provider,
      model: body.llm?.model ?? existing.llm.model,
      api_key: body.llm?.api_key ?? existing.llm.api_key,
      base_url: body.llm?.base_url ?? existing.llm.base_url,
    },
  };

  saveAgentConfig(updated);

  return NextResponse.json({
    ...updated,
    llm: {
      ...updated.llm,
      api_key: maskKey(updated.llm.api_key),
    },
  });
}
