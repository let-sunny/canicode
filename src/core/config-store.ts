import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "aiready");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface AireadyConfig {
  figmaToken?: string;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function readConfig(): AireadyConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as AireadyConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: AireadyConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getFigmaToken(): string | undefined {
  // Priority: env var > config file
  return process.env["FIGMA_TOKEN"] ?? readConfig().figmaToken;
}

export function setFigmaToken(token: string): void {
  const config = readConfig();
  config.figmaToken = token;
  writeConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
