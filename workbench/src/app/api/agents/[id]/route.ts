import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  updateAgent,
  deleteAgent,
  getAgentByName,
} from "@/lib/agent-db";
import { ensureAgentDir, removeAgentDir, getAgentDir } from "@/lib/agents-fs";
import fs from "fs";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(agent);
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
  const { name, description } = body;

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!NAME_RE.test(name)) {
      return NextResponse.json(
        { error: "name must contain only alphanumeric characters, hyphens, and underscores" },
        { status: 400 }
      );
    }

    if (name !== agent.name) {
      const existing = getAgentByName(name);
      if (existing) {
        return NextResponse.json(
          { error: "An agent with this name already exists" },
          { status: 409 }
        );
      }
    }
  }

  const updates: { name?: string; description?: string } = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;

  const updated = updateAgent(Number(id), updates);

  // Rename filesystem directory if name changed
  if (name !== undefined && name !== agent.name) {
    const oldDir = getAgentDir(agent.name);
    const newDir = getAgentDir(name);
    if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    } else {
      ensureAgentDir(name);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(Number(id));

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  deleteAgent(Number(id));
  removeAgentDir(agent.name);

  return NextResponse.json({ success: true });
}
