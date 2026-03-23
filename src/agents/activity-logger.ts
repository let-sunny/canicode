import { existsSync, mkdirSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

export interface ActivityStep {
  step: string;
  nodePath?: string;
  result: string;
  durationMs: number;
}

function getIsoTimestamp(): string {
  return new Date().toISOString();
}

function getDateTimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}-${minutes}`;
}

/**
 * Extract a short fixture name from a file path.
 * e.g. "fixtures/http-design.json" → "http-design"
 */
function extractFixtureName(fixturePath: string): string {
  const fileName = fixturePath.split("/").pop() ?? fixturePath;
  return fileName.replace(/\.json$/, "");
}

export class ActivityLogger {
  private logPath: string;
  private initialized = false;

  constructor(fixturePath?: string, logDir = "logs/activity") {
    const dateTimeStr = getDateTimeString();
    const fixtureName = fixturePath ? extractFixtureName(fixturePath) : "unknown";
    this.logPath = resolve(logDir, `${dateTimeStr}-${fixtureName}.jsonl`);
  }

  /**
   * Ensure the log directory and file header exist
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const dir = dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.logPath)) {
      // Write the initial "session-start" entry as the first JSON line
      const entry = {
        step: "session-start",
        timestamp: getIsoTimestamp(),
        result: "Calibration activity log initialized",
        durationMs: 0,
      };
      await writeFile(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
    }

    this.initialized = true;
  }

  /**
   * Log a pipeline step as a JSON Lines entry
   */
  async logStep(activity: ActivityStep): Promise<void> {
    await this.ensureInitialized();

    const entry: Record<string, unknown> = {
      step: activity.step,
      timestamp: getIsoTimestamp(),
      result: activity.result,
      durationMs: activity.durationMs,
    };

    if (activity.nodePath !== undefined) {
      entry["nodePath"] = activity.nodePath;
    }

    await appendFile(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
  }

  /**
   * Log a summary at pipeline completion as a JSON Lines entry
   */
  async logSummary(summary: {
    totalDurationMs: number;
    nodesAnalyzed: number;
    nodesConverted: number;
    mismatches: number;
    adjustments: number;
    status: string;
  }): Promise<void> {
    await this.ensureInitialized();

    const entry = {
      step: "Pipeline Summary",
      timestamp: getIsoTimestamp(),
      result: summary.status,
      durationMs: summary.totalDurationMs,
      nodesAnalyzed: summary.nodesAnalyzed,
      nodesConverted: summary.nodesConverted,
      mismatches: summary.mismatches,
      adjustments: summary.adjustments,
    };

    await appendFile(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
  }

  getLogPath(): string {
    return this.logPath;
  }
}
