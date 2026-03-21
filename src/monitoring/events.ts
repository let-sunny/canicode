/**
 * Typed event definitions for PostHog analytics.
 * Only event metadata is tracked — no design data, tokens, or file contents.
 */

export const EVENTS = {
  // Analysis
  ANALYSIS_STARTED: "analysis_started",
  ANALYSIS_COMPLETED: "analysis_completed",
  ANALYSIS_FAILED: "analysis_failed",

  // Report
  REPORT_GENERATED: "report_generated",
  COMMENT_POSTED: "comment_posted",
  COMMENT_FAILED: "comment_failed",

  // MCP
  MCP_TOOL_CALLED: "mcp_tool_called",

  // CLI
  CLI_COMMAND: "cli_command",
  CLI_INIT: "cli_init",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
