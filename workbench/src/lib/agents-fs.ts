import fs from "fs";
import path from "path";

/** Default base directory for agent data */
export const AGENTS_BASE_DIR = path.resolve(
  process.cwd(),
  "..",
  "..",
  "shared-data",
  "agent"
);

/** Skill source directories to scan for available skills */
export const SKILL_SOURCE_DIRS = [
  path.resolve(process.cwd(), "..", "skills"),
  path.resolve(process.cwd(), "..", ".claude", "skills"),
];

/**
 * Get the filesystem path for an agent directory.
 */
export function getAgentDir(agentName: string, baseDir?: string): string {
  return path.join(baseDir ?? AGENTS_BASE_DIR, agentName);
}

/**
 * Ensure an agent directory exists with default files.
 * Creates the directory and default files if they don't exist.
 * Does not overwrite existing files.
 */
export function ensureAgentDir(agentName: string, baseDir?: string): string {
  const dir = getAgentDir(agentName, baseDir);
  fs.mkdirSync(dir, { recursive: true });

  const skillsDir = path.join(dir, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });

  const defaults: Record<string, string> = {
    "CLAUDE.md": "",
    "REFLECTION.md": "",
    "mcp-config.json": JSON.stringify({ mcpServers: {} }, null, 2),
  };

  for (const [filename, content] of Object.entries(defaults)) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  }

  return dir;
}

/**
 * Remove an agent directory and all its contents.
 */
export function removeAgentDir(agentName: string, baseDir?: string): void {
  const dir = getAgentDir(agentName, baseDir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Read a file from an agent directory.
 * Returns null if the file or directory doesn't exist.
 */
export function readAgentFile(
  agentName: string,
  filename: string,
  baseDir?: string
): string | null {
  const filePath = path.join(getAgentDir(agentName, baseDir), filename);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write content to a file in an agent directory.
 */
export function writeAgentFile(
  agentName: string,
  filename: string,
  content: string,
  baseDir?: string
): void {
  const filePath = path.join(getAgentDir(agentName, baseDir), filename);
  fs.writeFileSync(filePath, content);
}

/**
 * List skill directories within an agent's skills folder.
 */
export function listAgentSkills(
  agentName: string,
  baseDir?: string
): string[] {
  const skillsDir = path.join(getAgentDir(agentName, baseDir), "skills");
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Copy a skill from a source directory into an agent's skills folder.
 * Copies ALL files from the source skill directory, not just SKILL.md.
 */
export function addAgentSkill(
  agentName: string,
  skillName: string,
  sourceDir: string,
  baseDir?: string
): void {
  const srcPath = path.join(sourceDir, skillName);
  const destPath = path.join(getAgentDir(agentName, baseDir), "skills", skillName);
  fs.cpSync(srcPath, destPath, { recursive: true });
}

/**
 * Remove a skill from an agent's skills folder.
 */
export function removeAgentSkill(
  agentName: string,
  skillName: string,
  baseDir?: string
): void {
  const skillPath = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName
  );
  fs.rmSync(skillPath, { recursive: true, force: true });
}

/**
 * Read the SKILL.md file from an agent's skill directory.
 * Returns null if the skill or file doesn't exist.
 */
export function readAgentSkill(
  agentName: string,
  skillName: string,
  baseDir?: string
): string | null {
  const filePath = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName,
    "SKILL.md"
  );
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write content to the SKILL.md file in an agent's skill directory.
 */
export function writeAgentSkill(
  agentName: string,
  skillName: string,
  content: string,
  baseDir?: string
): void {
  const filePath = path.join(
    getAgentDir(agentName, baseDir),
    "skills",
    skillName,
    "SKILL.md"
  );
  fs.writeFileSync(filePath, content);
}

/**
 * Scan source directories for available skills.
 * A valid skill is a subdirectory containing a SKILL.md file.
 */
export function getAvailableSkills(
  sourceDirs?: string[]
): { name: string; path: string }[] {
  const dirs = sourceDirs ?? SKILL_SOURCE_DIRS;
  const skills: { name: string; path: string }[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(dir, entry.name);
      const skillMdPath = path.join(skillPath, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        skills.push({ name: entry.name, path: skillPath });
      }
    }
  }

  return skills;
}
