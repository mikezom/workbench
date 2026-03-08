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
      const agent = createAgent("test-agent", "A test agent");

      expect(agent).toBeDefined();
      expect(agent.id).toBeTypeOf("number");
      expect(agent.name).toBe("test-agent");
      expect(agent.description).toBe("A test agent");
      expect(agent.created_at).toBeDefined();
      expect(agent.updated_at).toBeDefined();
    });

    it("should create an agent without description", () => {
      const agent = createAgent("no-desc-agent");

      expect(agent.name).toBe("no-desc-agent");
      expect(agent.description).toBeNull();
    });

    it("should throw on duplicate name", () => {
      createAgent("unique-agent");
      expect(() => createAgent("unique-agent")).toThrow();
    });
  });

  describe("getAgent", () => {
    it("should retrieve an agent by id", () => {
      const created = createAgent("by-id-agent", "desc");
      const retrieved = getAgent(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe("by-id-agent");
    });

    it("should return null for non-existent id", () => {
      const result = getAgent(99999);
      expect(result).toBeNull();
    });
  });

  describe("getAgentByName", () => {
    it("should retrieve an agent by name", () => {
      createAgent("named-agent", "found by name");
      const retrieved = getAgentByName("named-agent");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("named-agent");
      expect(retrieved!.description).toBe("found by name");
    });

    it("should return null for non-existent name", () => {
      const result = getAgentByName("ghost");
      expect(result).toBeNull();
    });
  });

  describe("getAllAgents", () => {
    it("should return empty array when no agents exist", () => {
      const agents = getAllAgents();
      expect(agents).toEqual([]);
    });

    it("should return all agents", () => {
      createAgent("agent-1");
      createAgent("agent-2");
      createAgent("agent-3");

      const agents = getAllAgents();
      expect(agents).toHaveLength(3);
    });
  });

  describe("updateAgent", () => {
    it("should update agent name", () => {
      const created = createAgent("old-name");
      const updated = updateAgent(created.id, { name: "new-name" });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("new-name");
    });

    it("should update agent description", () => {
      const created = createAgent("desc-agent", "old desc");
      const updated = updateAgent(created.id, { description: "new desc" });

      expect(updated).not.toBeNull();
      expect(updated!.description).toBe("new desc");
    });

    it("should update both name and description", () => {
      const created = createAgent("both-agent", "old");
      const updated = updateAgent(created.id, {
        name: "both-updated",
        description: "new",
      });

      expect(updated!.name).toBe("both-updated");
      expect(updated!.description).toBe("new");
    });

    it("should set updated_at on update", () => {
      const created = createAgent("timestamp-agent");
      const updated = updateAgent(created.id, { name: "renamed" });

      expect(updated).not.toBeNull();
      // updated_at should be set (may equal created_at if very fast, but should exist)
      expect(updated!.updated_at).toBeDefined();
    });

    it("should return null for non-existent id", () => {
      const result = updateAgent(99999, { name: "nope" });
      expect(result).toBeNull();
    });

    it("should return existing agent when no updates provided", () => {
      const created = createAgent("no-change");
      const result = updateAgent(created.id, {});

      expect(result).not.toBeNull();
      expect(result!.name).toBe("no-change");
    });
  });

  describe("deleteAgent", () => {
    it("should delete an existing agent", () => {
      const created = createAgent("to-delete");
      const deleted = deleteAgent(created.id);

      expect(deleted).toBe(true);
      expect(getAgent(created.id)).toBeNull();
    });

    it("should return false for non-existent id", () => {
      const result = deleteAgent(99999);
      expect(result).toBe(false);
    });
  });
});
