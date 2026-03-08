import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import {
  readAgentSkill,
  writeAgentSkill,
  removeAgentSkill,
} from "@/lib/agents-fs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const content = readAgentSkill(agent.name, name);

  if (content === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({ name, content });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const { content } = body;

  writeAgentSkill(agent.name, name, content);

  return NextResponse.json({ name, content });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  removeAgentSkill(agent.name, name);

  return NextResponse.json({ success: true });
}
