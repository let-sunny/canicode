/**
 * Ablation runner: calls the Anthropic API with extended thinking
 * to convert a design tree into HTML, measuring thinking tokens as a signal
 * for implementation difficulty.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Result from a single ablation conversion run. */
export interface AblationRunResult {
  /** Number of tokens used in the thinking/reasoning step. */
  thinkingTokens: number;
  /** Number of tokens in the output (HTML). */
  outputTokens: number;
  /** The generated HTML code. */
  html: string;
}

/** Options for the ablation runner. */
export interface AblationRunnerOptions {
  /** Budget for extended thinking tokens. Default: 10000. */
  budgetTokens?: number;
  /** Max output tokens for the response. Default: 16000. */
  maxTokens?: number;
}

const MODEL = "claude-sonnet-4-6" as const;
const DEFAULT_BUDGET_TOKENS = 10000;
const DEFAULT_MAX_TOKENS = 16000;

/**
 * Build the converter prompt for design-to-HTML conversion.
 * This is a focused, minimal prompt that asks the model to convert
 * a design tree into a single HTML file.
 */
function buildConverterPrompt(designTree: string): string {
  return `You are a frontend developer. Convert the following design tree into a single, self-contained HTML file.

Requirements:
- Output ONLY the HTML code, nothing else. No markdown fences, no explanations.
- Use inline CSS styles (no external stylesheets).
- Match every dimension, color, font, spacing, and layout property exactly as specified.
- Each node in the design tree maps to one HTML element.
- Use semantic HTML where appropriate (div, section, h1-h6, p, span, etc.).
- For images ([IMAGE] or url(...)), use a colored placeholder div with the same dimensions.
- Include a reset style: * { margin: 0; padding: 0; box-sizing: border-box; }

Design Tree:
${designTree}`;
}

/**
 * Run a single ablation conversion using the Anthropic API with extended thinking.
 *
 * Uses claude-sonnet-4-6 with extended thinking enabled to measure:
 * - thinkingTokens: how much reasoning the model needed
 * - outputTokens: how much code was generated
 * - html: the actual generated HTML
 *
 * Temperature is controlled by extended thinking (deterministic reasoning).
 */
export async function runAblation(
  designTree: string,
  options?: AblationRunnerOptions,
): Promise<AblationRunResult> {
  const budgetTokens = options?.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: {
      type: "enabled",
      budget_tokens: budgetTokens,
    },
    messages: [
      {
        role: "user",
        content: buildConverterPrompt(designTree),
      },
    ],
  });

  // Extract thinking tokens from usage
  const usage = response.usage as unknown as Record<string, unknown>;
  const thinkingTokens = usage["thinking_tokens"];
  const outputTokens = response.usage.output_tokens;

  // Extract HTML from response content blocks
  let html = "";
  for (const block of response.content) {
    if (block.type === "text") {
      html += block.text;
    }
  }

  // Clean up: remove markdown fences if the model wraps the output
  html = html.trim();
  if (html.startsWith("```html")) {
    html = html.slice(7);
  } else if (html.startsWith("```")) {
    html = html.slice(3);
  }
  if (html.endsWith("```")) {
    html = html.slice(0, -3);
  }
  html = html.trim();

  return {
    thinkingTokens: typeof thinkingTokens === "number" ? thinkingTokens : 0,
    outputTokens,
    html,
  };
}
