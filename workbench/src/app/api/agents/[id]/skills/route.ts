import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { listAgentSkills, addAgentSkill } from "@/lib/agents-fs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const skills = listAgentSkills(agent.name);
  return NextResponse.json({ skills });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const { skillName, sourcePath } = body;

  if (!skillName || !sourcePath) {
    return NextResponse.json(
      { error: "skillName and sourcePath are required" },
      { status: 400 }
    );
  }

  addAgentSkill(agent.name, skillName, sourcePath);
  const skills = listAgentSkills(agent.name);

  return NextResponse.json({ skills }, { status: 201 });
}
