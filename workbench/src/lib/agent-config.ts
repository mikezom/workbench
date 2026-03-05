import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

/**
 * DEPRECATED: This config file is no longer used by the agent system.
 *
 * Both working agents and decompose agents use Claude Code CLI directly,
 * which handles authentication via the local Claude CLI configuration.
 *
 * This file and its API routes are kept for reference only and may be
 * removed in future versions.
 *
 * To configure Claude CLI authentication, use: `claude auth login`
 */

const CONFIG_PATH = path.join(process.cwd(), "data", "agent-config.json");

export interface AgentConfig {
  llm: {
    provider: string;
    model: string;
    api_key: string;
    base_url: string;
  };
}

const DEFAULT_CONFIG: AgentConfig = {
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    api_key: "",
    base_url: "https://api.anthropic.com",
  },
};

export function getAgentConfig(): AgentConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function saveAgentConfig(config: AgentConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
