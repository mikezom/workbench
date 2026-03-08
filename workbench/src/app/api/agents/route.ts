import { NextRequest, NextResponse } from "next/server";
import {
  getAllAgents,
  createAgent,
  getAgentByName,
} from "@/lib/agent-db";
import { ensureAgentDir } from "@/lib/agents-fs";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function GET() {
  const agents = getAllAgents();
  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "name must contain only alphanumeric characters, hyphens, and underscores" },
      { status: 400 }
    );
  }

  const existing = getAgentByName(name);
  if (existing) {
    return NextResponse.json(
      { error: "An agent with this name already exists" },
      { status: 409 }
    );
  }

  const agent = createAgent(name, description);
  ensureAgentDir(name);

  return NextResponse.json(agent, { status: 201 });
}
