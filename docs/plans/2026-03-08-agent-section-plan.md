# Agent Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Agent management section with list+detail UI, backed by SQLite index + filesystem storage at `DEVELOPMENT/shared-data/agent/<name>/`.

**Architecture:** SQLite `agents` table stores name/description as an index. Agent content (CLAUDE.md, REFLECTION.md, skills/, mcp-config.json) lives on disk at `DEVELOPMENT/shared-data/agent/<name>/`. API routes bridge DB lookups to filesystem reads/writes. UI is a left-panel agent list + right-panel detail with 4 tabs.

**Tech Stack:** Next.js 14 (App Router), TypeScript, SQLite (better-sqlite3), Tailwind CSS, Vitest

---

### Task 1: Agent Database Schema + CRUD

**Files:**
- Modify: `workbench/src/lib/agent-db.ts` (append after existing code)
- Modify: `workbench/src/lib/db.ts:32` (add init call)
- Test: `workbench/src/lib/agents-db.test.ts`

**Step 1: Write the failing tests**

Create `workbench/src/lib/agents-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  createAgent,
  getAgent,
  getAgentByName,
  getAllAgents,
  updateAgent,
  deleteAgent,
} from "./agent-db";
import { getDb } from "./db";

describe("agents CRUD", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM agents");
  });

  describe("createAgent", () => {
    it("should create an agent with name and description", () => {
      const agent = createAgent("worker", "A worker agent");
      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe("worker");
      expect(agent.description).toBe("A worker agent");
      expect(agent.created_at).toBeDefined();
      expect(agent.updated_at).toBeDefined();
    });

    it("should create an agent without description", () => {
      const agent = createAgent("minimal");
      expect(agent.name).toBe("minimal");
      expect(agent.description).toBeNull();
    });

    it("should reject duplicate names", () => {
      createAgent("worker");
      expect(() => createAgent("worker")).toThrow();
    });
  });

  describe("getAgent", () => {
    it("should retrieve an agent by id", () => {
      const created = createAgent("worker", "test");
      const retrieved = getAgent(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("worker");
    });

    it("should return null for non-existent id", () => {
      expect(getAgent(9999)).toBeNull();
    });
  });

  describe("getAgentByName", () => {
    it("should retrieve an agent by name", () => {
      createAgent("worker", "test");
      const agent = getAgentByName("worker");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("worker");
    });

    it("should return null for non-existent name", () => {
      expect(getAgentByName("nope")).toBeNull();
    });
  });

  describe("getAllAgents", () => {
    it("should return all agents", () => {
      createAgent("agent-a");
      createAgent("agent-b");
      const agents = getAllAgents();
      expect(agents).toHaveLength(2);
    });

    it("should return empty array when no agents", () => {
      expect(getAllAgents()).toHaveLength(0);
    });
  });

  describe("updateAgent", () => {
    it("should update name", () => {
      const created = createAgent("old-name");
      const updated = updateAgent(created.id, { name: "new-name" });
      expect(updated?.name).toBe("new-name");
    });

    it("should update description", () => {
      const created = createAgent("worker");
      const updated = updateAgent(created.id, { description: "updated" });
      expect(updated?.description).toBe("updated");
    });

    it("should return null for non-existent id", () => {
      expect(updateAgent(9999, { name: "x" })).toBeNull();
    });
  });

  describe("deleteAgent", () => {
    it("should delete an agent", () => {
      const created = createAgent("worker");
      expect(deleteAgent(created.id)).toBe(true);
      expect(getAgent(created.id)).toBeNull();
    });

    it("should return false for non-existent id", () => {
      expect(deleteAgent(9999)).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd workbench && npx vitest run src/lib/agents-db.test.ts --reporter=verbose`
Expected: FAIL — `createAgent`, `getAgent`, etc. not exported from `./agent-db`

**Step 3: Write the schema and CRUD functions**

Add to `workbench/src/lib/agent-db.ts` (at the top of the file, inside `initAgentSchema`'s `db.exec` block, add after the existing tables):

```sql
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add these exports at the bottom of `workbench/src/lib/agent-db.ts`:

```typescript
// ---------------------------------------------------------------------------
// Agent definition types
// ---------------------------------------------------------------------------

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Agent definition CRUD
// ---------------------------------------------------------------------------

export function createAgent(name: string, description?: string): Agent {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO agents (name, description) VALUES (?, ?)`
    )
    .run(name, description ?? null);
  return getAgent(result.lastInsertRowid as number)!;
}

export function getAgent(id: number): Agent | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM agents WHERE id = ?")
    .get(id) as Agent | undefined;
  return row ?? null;
}

export function getAgentByName(name: string): Agent | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM agents WHERE name = ?")
    .get(name) as Agent | undefined;
  return row ?? null;
}

export function getAllAgents(): Agent[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agents ORDER BY created_at ASC")
    .all() as Agent[];
}

export function updateAgent(
  id: number,
  updates: { name?: string; description?: string }
): Agent | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM agents WHERE id = ?")
    .get(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (sets.length === 0) return getAgent(id);

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getAgent(id);
}

export function deleteAgent(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  return result.changes > 0;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd workbench && npx vitest run src/lib/agents-db.test.ts --reporter=verbose`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add workbench/src/lib/agent-db.ts workbench/src/lib/agents-db.test.ts
git commit -m "feat: add agents table schema and CRUD functions"
```

---

### Task 2: Filesystem Helper Module (agents-fs.ts)

**Files:**
- Create: `workbench/src/lib/agents-fs.ts`
- Test: `workbench/src/lib/agents-fs.test.ts`

**Context:** This module handles all filesystem operations for agent directories at `DEVELOPMENT/shared-data/agent/<name>/`. It reads/writes CLAUDE.md, REFLECTION.md, mcp-config.json, and manages the `skills/` subdirectory.

**Step 1: Write the failing tests**

Create `workbench/src/lib/agents-fs.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getAgentDir,
  ensureAgentDir,
  removeAgentDir,
  readAgentFile,
  writeAgentFile,
  listAgentSkills,
  addAgentSkill,
  removeAgentSkill,
  readAgentSkill,
  writeAgentSkill,
  getAvailableSkills,
  AGENTS_BASE_DIR,
} from "./agents-fs";

// Override base dir for tests
let testBaseDir: string;

describe("agents-fs", () => {
  beforeEach(() => {
    testBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-test-"));
    // We'll need to set the base dir for testing — see implementation note
  });

  afterEach(() => {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  });

  describe("ensureAgentDir", () => {
    it("should create the agent directory with default files", () => {
      const dir = ensureAgentDir("worker", testBaseDir);
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, "CLAUDE.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "REFLECTION.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "mcp-config.json"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "skills"))).toBe(true);
    });
  });

  describe("removeAgentDir", () => {
    it("should remove the agent directory", () => {
      const dir = ensureAgentDir("worker", testBaseDir);
      removeAgentDir("worker", testBaseDir);
      expect(fs.existsSync(dir)).toBe(false);
    });
  });

  describe("readAgentFile / writeAgentFile", () => {
    it("should read and write CLAUDE.md", () => {
      ensureAgentDir("worker", testBaseDir);
      writeAgentFile("worker", "CLAUDE.md", "# My Persona", testBaseDir);
      const content = readAgentFile("worker", "CLAUDE.md", testBaseDir);
      expect(content).toBe("# My Persona");
    });

    it("should return null for non-existent agent", () => {
      const content = readAgentFile("ghost", "CLAUDE.md", testBaseDir);
      expect(content).toBeNull();
    });
  });

  describe("skills management", () => {
    it("should list skills (empty initially)", () => {
      ensureAgentDir("worker", testBaseDir);
      expect(listAgentSkills("worker", testBaseDir)).toEqual([]);
    });

    it("should add a skill from a source directory", () => {
      ensureAgentDir("worker", testBaseDir);
      // Create a fake source skill
      const sourceDir = path.join(testBaseDir, "_source", "my-skill");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# My Skill");

      addAgentSkill("worker", "my-skill", sourceDir, testBaseDir);

      const skills = listAgentSkills("worker", testBaseDir);
      expect(skills).toEqual(["my-skill"]);

      const content = readAgentSkill("worker", "my-skill", testBaseDir);
      expect(content).toBe("# My Skill");
    });

    it("should remove a skill", () => {
      ensureAgentDir("worker", testBaseDir);
      const sourceDir = path.join(testBaseDir, "_source", "my-skill");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# My Skill");
      addAgentSkill("worker", "my-skill", sourceDir, testBaseDir);

      removeAgentSkill("worker", "my-skill", testBaseDir);
      expect(listAgentSkills("worker", testBaseDir)).toEqual([]);
    });

    it("should write updated skill content", () => {
      ensureAgentDir("worker", testBaseDir);
      const sourceDir = path.join(testBaseDir, "_source", "my-skill");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# Original");
      addAgentSkill("worker", "my-skill", sourceDir, testBaseDir);

      writeAgentSkill("worker", "my-skill", "# Updated", testBaseDir);
      expect(readAgentSkill("worker", "my-skill", testBaseDir)).toBe("# Updated");
    });
  });

  describe("getAvailableSkills", () => {
    it("should scan a skills directory for available skills", () => {
      // Create fake skills source
      const skillsRoot = path.join(testBaseDir, "_all-skills");
      fs.mkdirSync(path.join(skillsRoot, "skill-a"), { recursive: true });
      fs.writeFileSync(path.join(skillsRoot, "skill-a", "SKILL.md"), "# A");
      fs.mkdirSync(path.join(skillsRoot, "skill-b"), { recursive: true });
      fs.writeFileSync(path.join(skillsRoot, "skill-b", "SKILL.md"), "# B");

      const skills = getAvailableSkills([skillsRoot]);
      expect(skills).toHaveLength(2);
      expect(skills.map((s) => s.name).sort()).toEqual(["skill-a", "skill-b"]);
    });

    it("should skip directories without SKILL.md", () => {
      const skillsRoot = path.join(testBaseDir, "_all-skills");
      fs.mkdirSync(path.join(skillsRoot, "no-skill"), { recursive: true });
      fs.writeFileSync(path.join(skillsRoot, "no-skill", "README.md"), "nope");

      const skills = getAvailableSkills([skillsRoot]);
      expect(skills).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd workbench && npx vitest run src/lib/agents-fs.test.ts --reporter=verbose`
Expected: FAIL — module `./agents-fs` does not exist

**Step 3: Implement agents-fs.ts**

Create `workbench/src/lib/agents-fs.ts`:

```typescript
import fs from "fs";
import path from "path";

// Default base directory for agent data
export const AGENTS_BASE_DIR = path.resolve(
  process.cwd(),
  "..",
  "..",
  "shared-data",
  "agent"
);

// Skill source directories to scan for available skills
export const SKILL_SOURCE_DIRS = [
  path.resolve(process.cwd(), "..", "skills"),           // workbench/skills/
  path.resolve(process.cwd(), "..", ".claude", "skills"), // .claude/skills/
];

export function getAgentDir(agentName: string, baseDir?: string): string {
  return path.join(baseDir ?? AGENTS_BASE_DIR, agentName);
}

export function ensureAgentDir(agentName: string, baseDir?: string): string {
  const dir = getAgentDir(agentName, baseDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "skills"), { recursive: true });

  // Create default files if they don't exist
  const defaults: Record<string, string> = {
    "CLAUDE.md": "",
    "REFLECTION.md": "",
    "mcp-config.json": JSON.stringify({ mcpServers: {} }, null, 2),
  };

  for (const [filename, content] of Object.entries(defaults)) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  return dir;
}

export function removeAgentDir(agentName: string, baseDir?: string): void {
  const dir = getAgentDir(agentName, baseDir);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function readAgentFile(
  agentName: string,
  filename: string,
  baseDir?: string
): string | null {
  const filePath = path.join(getAgentDir(agentName, baseDir), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function writeAgentFile(
  agentName: string,
  filename: string,
  content: string,
  baseDir?: string
): void {
  const dir = getAgentDir(agentName, baseDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

export function listAgentSkills(
  agentName: string,
  baseDir?: string
): string[] {
  const skillsDir = path.join(getAgentDir(agentName, baseDir), "skills");
  if (!fs.existsSync(skillsDir)) return [];

  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function addAgentSkill(
  agentName: string,
  skillName: string,
  sourceDir: string,
  baseDir?: string
): void {
  const targetDir = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName
  );
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy all files from source skill directory
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      fs.copyFileSync(
        path.join(sourceDir, entry.name),
        path.join(targetDir, entry.name)
      );
    }
  }
}

export function removeAgentSkill(
  agentName: string,
  skillName: string,
  baseDir?: string
): void {
  const skillDir = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName
  );
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

export function readAgentSkill(
  agentName: string,
  skillName: string,
  baseDir?: string
): string | null {
  const skillPath = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName,
    "SKILL.md"
  );
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, "utf-8");
}

export function writeAgentSkill(
  agentName: string,
  skillName: string,
  content: string,
  baseDir?: string
): void {
  const skillPath = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName,
    "SKILL.md"
  );
  fs.writeFileSync(skillPath, content, "utf-8");
}

export function getAvailableSkills(
  sourceDirs?: string[]
): { name: string; path: string }[] {
  const dirs = sourceDirs ?? SKILL_SOURCE_DIRS;
  const skills: { name: string; path: string }[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (seen.has(entry.name)) continue;

      const skillMdPath = path.join(dir, entry.name, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        seen.add(entry.name);
        skills.push({ name: entry.name, path: path.join(dir, entry.name) });
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
```

**Step 4: Run tests to verify they pass**

Run: `cd workbench && npx vitest run src/lib/agents-fs.test.ts --reporter=verbose`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add workbench/src/lib/agents-fs.ts workbench/src/lib/agents-fs.test.ts
git commit -m "feat: add filesystem helpers for agent directories"
```

---

### Task 3: Agent CRUD API Routes

**Files:**
- Create: `workbench/src/app/api/agents/route.ts`
- Create: `workbench/src/app/api/agents/[id]/route.ts`

**Step 1: Create GET/POST /api/agents**

Create `workbench/src/app/api/agents/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAllAgents, createAgent } from "@/lib/agent-db";
import { ensureAgentDir } from "@/lib/agents-fs";

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

  // Validate name: alphanumeric, hyphens, underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) {
    return NextResponse.json(
      { error: "name must contain only letters, numbers, hyphens, and underscores" },
      { status: 400 }
    );
  }

  try {
    const agent = createAgent(name.trim(), description?.trim() || undefined);
    ensureAgentDir(agent.name);
    return NextResponse.json(agent, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "An agent with this name already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}
```

**Step 2: Create GET/PUT/DELETE /api/agents/[id]**

Create `workbench/src/app/api/agents/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgent, deleteAgent, getAgentByName } from "@/lib/agent-db";
import { removeAgentDir, getAgentDir, ensureAgentDir } from "@/lib/agents-fs";
import fs from "fs";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  return NextResponse.json(agent);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { name, description } = body;

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) {
      return NextResponse.json(
        { error: "name must contain only letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }
  }

  const existing = getAgent(Number(params.id));
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // If name is changing, rename the directory
  const newName = name?.trim();
  if (newName && newName !== existing.name) {
    const oldDir = getAgentDir(existing.name);
    const newDir = getAgentDir(newName);
    if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    } else {
      ensureAgentDir(newName);
    }
  }

  const updated = updateAgent(Number(params.id), {
    name: newName,
    description: description?.trim(),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = getAgent(Number(params.id));
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  deleteAgent(Number(params.id));
  removeAgentDir(existing.name);

  return NextResponse.json({ success: true });
}
```

**Step 3: Run the full test suite to verify nothing is broken**

Run: `cd workbench && npx vitest run --reporter=verbose`
Expected: All existing tests still PASS

**Step 4: Commit**

```bash
git add workbench/src/app/api/agents/route.ts workbench/src/app/api/agents/\[id\]/route.ts
git commit -m "feat: add agent CRUD API routes"
```

---

### Task 4: File Content API Routes (Persona, Memory, Tools)

**Files:**
- Create: `workbench/src/app/api/agents/[id]/persona/route.ts`
- Create: `workbench/src/app/api/agents/[id]/memory/route.ts`
- Create: `workbench/src/app/api/agents/[id]/tools/route.ts`

**Step 1: Create persona route**

Create `workbench/src/app/api/agents/[id]/persona/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { readAgentFile, writeAgentFile } from "@/lib/agents-fs";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const content = readAgentFile(agent.name, "CLAUDE.md");
  return NextResponse.json({ content: content ?? "" });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
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

  writeAgentFile(agent.name, "CLAUDE.md", content);
  return NextResponse.json({ content });
}
```

**Step 2: Create memory route**

Create `workbench/src/app/api/agents/[id]/memory/route.ts` — same pattern as persona but reads/writes `REFLECTION.md`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { readAgentFile, writeAgentFile } from "@/lib/agents-fs";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const content = readAgentFile(agent.name, "REFLECTION.md");
  return NextResponse.json({ content: content ?? "" });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
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

  writeAgentFile(agent.name, "REFLECTION.md", content);
  return NextResponse.json({ content });
}
```

**Step 3: Create tools route**

Create `workbench/src/app/api/agents/[id]/tools/route.ts` — same pattern but reads/writes `mcp-config.json`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { readAgentFile, writeAgentFile } from "@/lib/agents-fs";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const content = readAgentFile(agent.name, "mcp-config.json");
  return NextResponse.json({ content: content ?? '{"mcpServers":{}}' });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
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

  // Validate JSON
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
```

**Step 4: Run the full test suite**

Run: `cd workbench && npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add workbench/src/app/api/agents/\[id\]/persona/ workbench/src/app/api/agents/\[id\]/memory/ workbench/src/app/api/agents/\[id\]/tools/
git commit -m "feat: add API routes for agent persona, memory, and tools"
```

---

### Task 5: Skills Management API Routes

**Files:**
- Create: `workbench/src/app/api/agents/[id]/skills/route.ts`
- Create: `workbench/src/app/api/agents/[id]/skills/[name]/route.ts`
- Create: `workbench/src/app/api/agents/available-skills/route.ts`

**Step 1: Create skills list + add route**

Create `workbench/src/app/api/agents/[id]/skills/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { listAgentSkills, addAgentSkill } from "@/lib/agents-fs";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const skills = listAgentSkills(agent.name);
  return NextResponse.json({ skills });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = getAgent(Number(params.id));
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
```

**Step 2: Create individual skill route**

Create `workbench/src/app/api/agents/[id]/skills/[name]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agent-db";
import { readAgentSkill, writeAgentSkill, removeAgentSkill } from "@/lib/agents-fs";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string; name: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const content = readAgentSkill(agent.name, params.name);
  if (content === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({ name: params.name, content });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; name: string } }
) {
  const agent = getAgent(Number(params.id));
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

  writeAgentSkill(agent.name, params.name, content);
  return NextResponse.json({ name: params.name, content });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; name: string } }
) {
  const agent = getAgent(Number(params.id));
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  removeAgentSkill(agent.name, params.name);
  return NextResponse.json({ success: true });
}
```

**Step 3: Create available skills route**

Create `workbench/src/app/api/agents/available-skills/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getAvailableSkills } from "@/lib/agents-fs";

export function GET() {
  const skills = getAvailableSkills();
  return NextResponse.json({ skills });
}
```

**Step 4: Run the full test suite**

Run: `cd workbench && npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add workbench/src/app/api/agents/\[id\]/skills/ workbench/src/app/api/agents/available-skills/
git commit -m "feat: add skills management API routes"
```

---

### Task 6: Agent Page UI — Left Panel (Agent List)

**Files:**
- Modify: `workbench/src/app/agent/page.tsx` (replace placeholder)

**Step 1: Build the page shell with left panel agent list**

Replace the entire contents of `workbench/src/app/agent/page.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

interface Agent {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function AgentPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    const data = await res.json();
    setAgents(data);
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      }),
    });

    if (res.ok) {
      const agent = await res.json();
      setNewName("");
      setNewDescription("");
      setShowNewForm(false);
      await fetchAgents();
      setSelectedId(agent.id);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-3rem)] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Left Panel — Agent List */}
      <div className="w-64 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h1 className="text-lg font-bold mb-3">Agents</h1>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="w-full px-3 py-1.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            + New Agent
          </button>
        </div>

        {showNewForm && (
          <form onSubmit={handleCreate} className="p-4 border-b border-neutral-200 dark:border-neutral-700 space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Agent name"
              className="w-full px-2 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              autoFocus
            />
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-2 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded text-xs hover:bg-neutral-800 dark:hover:bg-neutral-200"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => { setShowNewForm(false); setNewName(""); setNewDescription(""); }}
                className="px-3 py-1 border border-neutral-300 dark:border-neutral-600 rounded text-xs hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 transition-colors ${
                selectedId === agent.id
                  ? "bg-neutral-100 dark:bg-neutral-800"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
            >
              <div className="text-sm font-medium">{agent.name}</div>
              {agent.description && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                  {agent.description}
                </div>
              )}
            </button>
          ))}
          {agents.length === 0 && (
            <div className="p-4 text-sm text-neutral-400 dark:text-neutral-500 text-center">
              No agents yet
            </div>
          )}
        </div>
      </div>

      {/* Right Panel — Agent Detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedAgent ? (
          <AgentDetail
            agent={selectedAgent}
            onUpdate={fetchAgents}
            onDelete={() => { setSelectedId(null); fetchAgents(); }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400 dark:text-neutral-500">
            Select an agent to view details
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Agent Detail Component (placeholder for Task 7) ----

function AgentDetail({
  agent,
  onUpdate,
  onDelete,
}: {
  agent: Agent;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">{agent.name}</h2>
          {agent.description && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {agent.description}
            </p>
          )}
        </div>
      </div>
      <p className="text-neutral-400">Detail tabs coming in next task...</p>
    </div>
  );
}
```

**Step 2: Verify the dev server builds**

Run: `cd workbench && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add workbench/src/app/agent/page.tsx
git commit -m "feat: add agent page with left panel list and create form"
```

---

### Task 7: Agent Page UI — Right Panel Detail with Tabs

**Files:**
- Modify: `workbench/src/app/agent/page.tsx` (replace AgentDetail component)

**Step 1: Implement the full AgentDetail component with 4 tabs**

Replace the `AgentDetail` function in `workbench/src/app/agent/page.tsx` with the full implementation. This is the bulk of the UI work.

The component should:
- Show agent name/description at top (editable inline)
- Delete button with confirmation
- 4 tabs: Persona, Memory, Skills, Tools
- Persona tab: textarea + save for CLAUDE.md
- Memory tab: textarea + save for REFLECTION.md
- Skills tab: list of skills with expand/edit, add picker, remove
- Tools tab: textarea + save for mcp-config.json

Key implementation details:

```typescript
function AgentDetail({
  agent,
  onUpdate,
  onDelete,
}: {
  agent: Agent;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"persona" | "memory" | "skills" | "tools">("persona");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // -- Name/description editing state --
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editDescription, setEditDescription] = useState(agent.description ?? "");

  // -- File content state (persona, memory, tools) --
  const [personaContent, setPersonaContent] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [toolsContent, setToolsContent] = useState("");
  const [personaDirty, setPersonaDirty] = useState(false);
  const [memoryDirty, setMemoryDirty] = useState(false);
  const [toolsDirty, setToolsDirty] = useState(false);

  // -- Skills state --
  const [skills, setSkills] = useState<string[]>([]);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState("");
  const [skillDirty, setSkillDirty] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<{ name: string; path: string }[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);

  // Fetch content when agent changes
  // Fetch persona, memory, tools, skills on agent selection
  // Save handlers for each tab
  // Delete handler with confirmation
  // Skill expand/collapse, add from picker, remove, edit
}
```

Each file tab follows this pattern:
1. `useEffect` fetches content from `GET /api/agents/[id]/persona` (or memory/tools)
2. Textarea displays content, tracks dirty state
3. Save button calls `PUT /api/agents/[id]/persona` with `{ content }`
4. Reset dirty state on save

Skills tab pattern:
1. `useEffect` fetches from `GET /api/agents/[id]/skills` and `GET /api/agents/available-skills`
2. List shows current skills, clicking expands to show/edit SKILL.md content
3. "Add Skill" button shows picker (available skills minus already-added)
4. Adding calls `POST /api/agents/[id]/skills` with `{ skillName, sourcePath }`
5. Removing calls `DELETE /api/agents/[id]/skills/[name]`
6. Editing calls `PUT /api/agents/[id]/skills/[name]` with `{ content }`

**Step 2: Verify the build**

Run: `cd workbench && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add workbench/src/app/agent/page.tsx
git commit -m "feat: add agent detail panel with persona, memory, skills, and tools tabs"
```

---

### Task 8: Update Documentation

**Files:**
- Modify: `docs/agent-section.md`

**Step 1: Update agent-section.md to reflect the implemented design**

Replace the placeholder content in `docs/agent-section.md` with accurate documentation covering:
- Overview of the Agent section
- Data model (SQLite index + filesystem at `shared-data/agent/<name>/`)
- UI layout (list + detail panel, 4 tabs)
- API routes
- Key files
- Integration points with Agentic Tasks / Monitor

**Step 2: Commit**

```bash
git add docs/agent-section.md
git commit -m "docs: update agent section documentation"
```

---

### Task 9: Full Build + Test Verification

**Step 1: Run the full test suite**

Run: `cd workbench && npx vitest run --reporter=verbose`
Expected: All tests PASS (existing + new agents-db + agents-fs tests)

**Step 2: Run the build**

Run: `cd workbench && npx next build`
Expected: Build succeeds with no errors

**Step 3: Manual smoke test**

Start dev server: `cd workbench && npm run dev`

Verify:
1. Navigate to `/agent` — see empty list with "New Agent" button
2. Create an agent named "worker" — appears in list, directory created at `shared-data/agent/worker/`
3. Click agent — detail panel shows with 4 tabs
4. Persona tab — edit and save CLAUDE.md content
5. Memory tab — edit and save REFLECTION.md content
6. Tools tab — edit and save mcp-config.json (validates JSON)
7. Skills tab — add a skill from available list, expand to view/edit, remove
8. Delete agent — removes from list and deletes directory
