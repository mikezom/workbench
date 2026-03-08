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
} from "./agents-fs";

describe("agents-fs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-fs-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getAgentDir", () => {
    it("should return the path to an agent directory", () => {
      const dir = getAgentDir("my-agent", tmpDir);
      expect(dir).toBe(path.join(tmpDir, "my-agent"));
    });
  });

  describe("ensureAgentDir", () => {
    it("should create agent directory with default files", () => {
      const dir = ensureAgentDir("test-agent", tmpDir);

      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, "CLAUDE.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "REFLECTION.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "mcp-config.json"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "skills"))).toBe(true);
    });

    it("should create CLAUDE.md with empty string", () => {
      ensureAgentDir("test-agent", tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, "test-agent", "CLAUDE.md"),
        "utf-8"
      );
      expect(content).toBe("");
    });

    it("should create REFLECTION.md with empty string", () => {
      ensureAgentDir("test-agent", tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, "test-agent", "REFLECTION.md"),
        "utf-8"
      );
      expect(content).toBe("");
    });

    it("should create mcp-config.json with empty mcpServers", () => {
      ensureAgentDir("test-agent", tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, "test-agent", "mcp-config.json"),
        "utf-8"
      );
      expect(JSON.parse(content)).toEqual({ mcpServers: {} });
    });

    it("should not overwrite existing files", () => {
      ensureAgentDir("test-agent", tmpDir);
      const agentDir = path.join(tmpDir, "test-agent");
      fs.writeFileSync(path.join(agentDir, "CLAUDE.md"), "custom content");

      ensureAgentDir("test-agent", tmpDir);
      const content = fs.readFileSync(
        path.join(agentDir, "CLAUDE.md"),
        "utf-8"
      );
      expect(content).toBe("custom content");
    });
  });

  describe("removeAgentDir", () => {
    it("should remove an existing agent directory", () => {
      ensureAgentDir("doomed-agent", tmpDir);
      removeAgentDir("doomed-agent", tmpDir);
      expect(fs.existsSync(path.join(tmpDir, "doomed-agent"))).toBe(false);
    });

    it("should not throw when removing non-existent agent", () => {
      expect(() => removeAgentDir("ghost", tmpDir)).not.toThrow();
    });
  });

  describe("readAgentFile", () => {
    it("should read an existing file", () => {
      ensureAgentDir("reader", tmpDir);
      writeAgentFile("reader", "CLAUDE.md", "hello world", tmpDir);

      const content = readAgentFile("reader", "CLAUDE.md", tmpDir);
      expect(content).toBe("hello world");
    });

    it("should return null for non-existent file", () => {
      ensureAgentDir("reader", tmpDir);
      const content = readAgentFile("reader", "NOPE.md", tmpDir);
      expect(content).toBeNull();
    });

    it("should return null for non-existent agent directory", () => {
      const content = readAgentFile("ghost", "CLAUDE.md", tmpDir);
      expect(content).toBeNull();
    });
  });

  describe("writeAgentFile", () => {
    it("should write content to a file", () => {
      ensureAgentDir("writer", tmpDir);
      writeAgentFile("writer", "CLAUDE.md", "new content", tmpDir);

      const content = fs.readFileSync(
        path.join(tmpDir, "writer", "CLAUDE.md"),
        "utf-8"
      );
      expect(content).toBe("new content");
    });

    it("should overwrite existing content", () => {
      ensureAgentDir("writer", tmpDir);
      writeAgentFile("writer", "CLAUDE.md", "first", tmpDir);
      writeAgentFile("writer", "CLAUDE.md", "second", tmpDir);

      const content = readAgentFile("writer", "CLAUDE.md", tmpDir);
      expect(content).toBe("second");
    });
  });

  describe("skills management", () => {
    it("listAgentSkills should return empty array for new agent", () => {
      ensureAgentDir("skilled", tmpDir);
      const skills = listAgentSkills("skilled", tmpDir);
      expect(skills).toEqual([]);
    });

    it("listAgentSkills should list skill directories", () => {
      ensureAgentDir("skilled", tmpDir);
      const skillsDir = path.join(tmpDir, "skilled", "skills");
      fs.mkdirSync(path.join(skillsDir, "skill-a"), { recursive: true });
      fs.mkdirSync(path.join(skillsDir, "skill-b"), { recursive: true });

      const skills = listAgentSkills("skilled", tmpDir);
      expect(skills.sort()).toEqual(["skill-a", "skill-b"]);
    });

    it("addAgentSkill should copy all files from source", () => {
      ensureAgentDir("skilled", tmpDir);

      // Create a source skill directory with multiple files
      const sourceDir = path.join(tmpDir, "source-skills", "my-skill");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# My Skill");
      fs.writeFileSync(path.join(sourceDir, "helper.ts"), "export const x = 1;");
      fs.mkdirSync(path.join(sourceDir, "sub"), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "sub", "nested.txt"), "nested");

      addAgentSkill(
        "skilled",
        "my-skill",
        path.join(tmpDir, "source-skills"),
        tmpDir
      );

      const destDir = path.join(tmpDir, "skilled", "skills", "my-skill");
      expect(fs.existsSync(path.join(destDir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(destDir, "helper.ts"))).toBe(true);
      expect(fs.existsSync(path.join(destDir, "sub", "nested.txt"))).toBe(true);
      expect(
        fs.readFileSync(path.join(destDir, "SKILL.md"), "utf-8")
      ).toBe("# My Skill");
    });

    it("removeAgentSkill should remove a skill directory", () => {
      ensureAgentDir("skilled", tmpDir);
      const skillDir = path.join(tmpDir, "skilled", "skills", "remove-me");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "bye");

      removeAgentSkill("skilled", "remove-me", tmpDir);
      expect(fs.existsSync(skillDir)).toBe(false);
    });

    it("removeAgentSkill should not throw for non-existent skill", () => {
      ensureAgentDir("skilled", tmpDir);
      expect(() => removeAgentSkill("skilled", "ghost", tmpDir)).not.toThrow();
    });

    it("readAgentSkill should read SKILL.md content", () => {
      ensureAgentDir("skilled", tmpDir);
      const skillDir = path.join(tmpDir, "skilled", "skills", "read-me");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "skill content");

      const content = readAgentSkill("skilled", "read-me", tmpDir);
      expect(content).toBe("skill content");
    });

    it("readAgentSkill should return null for non-existent skill", () => {
      ensureAgentDir("skilled", tmpDir);
      const content = readAgentSkill("skilled", "nope", tmpDir);
      expect(content).toBeNull();
    });

    it("writeAgentSkill should write SKILL.md content", () => {
      ensureAgentDir("skilled", tmpDir);
      const skillDir = path.join(tmpDir, "skilled", "skills", "write-me");
      fs.mkdirSync(skillDir, { recursive: true });

      writeAgentSkill("skilled", "write-me", "new skill content", tmpDir);

      const content = fs.readFileSync(
        path.join(skillDir, "SKILL.md"),
        "utf-8"
      );
      expect(content).toBe("new skill content");
    });
  });

  describe("getAvailableSkills", () => {
    it("should find skills with SKILL.md files", () => {
      const sourceDir = path.join(tmpDir, "available-skills");
      fs.mkdirSync(path.join(sourceDir, "alpha"), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "alpha", "SKILL.md"), "alpha skill");
      fs.mkdirSync(path.join(sourceDir, "beta"), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "beta", "SKILL.md"), "beta skill");

      const skills = getAvailableSkills([sourceDir]);
      const names = skills.map((s) => s.name).sort();
      expect(names).toEqual(["alpha", "beta"]);
    });

    it("should skip directories without SKILL.md", () => {
      const sourceDir = path.join(tmpDir, "available-skills");
      fs.mkdirSync(path.join(sourceDir, "has-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "has-skill", "SKILL.md"),
        "content"
      );
      fs.mkdirSync(path.join(sourceDir, "no-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "no-skill", "README.md"),
        "not a skill"
      );

      const skills = getAvailableSkills([sourceDir]);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("has-skill");
    });

    it("should scan multiple source directories", () => {
      const dir1 = path.join(tmpDir, "source1");
      const dir2 = path.join(tmpDir, "source2");
      fs.mkdirSync(path.join(dir1, "skill-a"), { recursive: true });
      fs.writeFileSync(path.join(dir1, "skill-a", "SKILL.md"), "a");
      fs.mkdirSync(path.join(dir2, "skill-b"), { recursive: true });
      fs.writeFileSync(path.join(dir2, "skill-b", "SKILL.md"), "b");

      const skills = getAvailableSkills([dir1, dir2]);
      const names = skills.map((s) => s.name).sort();
      expect(names).toEqual(["skill-a", "skill-b"]);
    });

    it("should return empty array for non-existent source dirs", () => {
      const skills = getAvailableSkills([path.join(tmpDir, "nope")]);
      expect(skills).toEqual([]);
    });

    it("should include the full path to each skill", () => {
      const sourceDir = path.join(tmpDir, "src-skills");
      fs.mkdirSync(path.join(sourceDir, "my-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "my-skill", "SKILL.md"),
        "content"
      );

      const skills = getAvailableSkills([sourceDir]);
      expect(skills[0].path).toBe(path.join(sourceDir, "my-skill"));
    });
  });
});
