import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { readAgentFile, writeAgentFile } from "@/lib/agents-fs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const content = readAgentFile(agent.name, "mcp-config.json") ?? "";

  return NextResponse.json({ content });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const { content } = body;

  if (typeof content !== "string") {
    return NextResponse.json(
      { error: "content must be a string" },
      { status: 400 }
    );
  }

  try {
    JSON.parse(content);
  } catch {
    return NextResponse.json(
      { error: "content must be valid JSON" },
      { status: 400 }
    );
  }

  writeAgentFile(agent.name, "mcp-config.json", content);

  return NextResponse.json({ content });
}
