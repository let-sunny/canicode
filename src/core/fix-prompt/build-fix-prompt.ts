/**
 * Deterministic fix-prompt builder (#587).
 *
 * Assembles the full "paste into the host design agent" prompt from a
 * report's issues — pure templating, no LLM call, no Node/DOM dependencies
 * (this module is exported through src/browser.ts and runs inside the Figma
 * plugin iframe). The prompt always contains the entire current report:
 * the plugin stays stateless, and re-analysis after the agent's fixes
 * naturally regenerates the remaining prompt.
 *
 * Per ADR-013 the prompt only directs the host agent; canicode does not
 * execute fixes.
 */

import { CATEGORIES, type Category } from "../contracts/category.js";
import type { RuleId } from "../contracts/rule.js";
import type { AnalysisIssue } from "../engine/rule-engine.js";
import { getFixPromptLine } from "../rules/fix-prompt-templates.js";
import { getRulePurpose, RULE_ID_CATEGORY } from "../rules/rule-config.js";

/**
 * Annotation convention the agent must follow when recording gotcha answers.
 * This block is the load-bearing piece of the verify loop: it must mirror
 * EXACTLY what upsertCanicodeAnnotation writes and
 * extractAcknowledgmentsFromNode reads (src/core/roundtrip/annotations.ts,
 * read-acknowledgments.ts) — otherwise re-analysis cannot detect the gotcha
 * as resolved. Exported so tests can assert the footer/category literals
 * stay in sync with the roundtrip contract.
 */
export const ANNOTATION_FORMAT_SPEC = `## Annotation format

When recording an answer, add a Figma annotation to the node (\`node.annotations\`) following this exact convention — CanICode re-analysis reads it to mark the issue as resolved:

- One annotation entry per answer, with the body set via \`labelMarkdown\` ONLY — never set both \`label\` and \`labelMarkdown\`.
- The body MUST end with the footer \`— *<rule-id>*\` (em-dash, space, rule id in italics) on its own line, e.g. \`— *missing-interaction-state*\`. Use the rule id given in parentheses for each item above.
- Set the entry's \`categoryId\` to the annotation category labeled \`canicode:gotcha\`. If that category does not exist yet, create it once with \`figma.annotations.addAnnotationCategoryAsync({ label: "canicode:gotcha", color: "blue" })\`. If you cannot create or assign categories, keep the footer anyway — footer-only annotations are still recognized.
- If the node already has an annotation whose body ends with the same \`— *<rule-id>*\` footer, REPLACE that entry instead of adding a duplicate.`;

export interface BuildFixPromptOptions {
  fileName?: string;
}

/**
 * Deterministic sort for fix instructions: structural fixes first.
 * CATEGORIES order puts pixel-critical (no-auto-layout etc.) ahead of
 * everything else — structural changes can invalidate other findings, so
 * the agent should apply them first. Ties break by rule id, then by the
 * original (document) order. No new config knob.
 */
function violationSortKey(issue: AnalysisIssue): [number, string] {
  const category: Category | undefined =
    RULE_ID_CATEGORY[issue.violation.ruleId as RuleId];
  const categoryIndex = category ? CATEGORIES.indexOf(category) : CATEGORIES.length;
  return [categoryIndex, issue.violation.ruleId];
}

function numbered(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

/**
 * Build the full fix prompt from a report's issues.
 *
 * - Acknowledged issues (already annotated, flagged by the rule engine) are
 *   dropped so regenerated prompts shrink as the agent works.
 * - Issues split by rule purpose (ADR-017): violations become imperative fix
 *   instructions, info-collection rules become ask-the-user instructions.
 * - The annotation-format spec is included only when gotcha items exist.
 *
 * Returns an empty string when there is nothing to do.
 */
export function buildFixPrompt(
  issues: AnalysisIssue[],
  opts: BuildFixPromptOptions = {}
): string {
  const active = issues.filter((issue) => issue.acknowledged !== true);

  const violations = active
    .map((issue, index) => ({ issue, index }))
    .filter(({ issue }) => getRulePurpose(issue.violation.ruleId) === "violation")
    .sort((a, b) => {
      const [catA, ruleA] = violationSortKey(a.issue);
      const [catB, ruleB] = violationSortKey(b.issue);
      if (catA !== catB) return catA - catB;
      if (ruleA !== ruleB) return ruleA < ruleB ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ issue }) => issue);

  const gotchas = active.filter(
    (issue) => getRulePurpose(issue.violation.ruleId) === "info-collection"
  );

  if (violations.length === 0 && gotchas.length === 0) return "";

  const fileRef = opts.fileName ? ` "${opts.fileName}"` : "";
  const sections: string[] = [
    `You are operating on the currently open Figma file${fileRef}. The CanICode plugin analyzed the current selection and found the items below. Apply the fixes and collect the missing context exactly as instructed. Node ids are given in parentheses — use them to locate each node.`,
  ];

  if (violations.length > 0) {
    sections.push(
      `## Fixes to apply\n\n${numbered(
        violations.map((issue) => getFixPromptLine(issue.violation))
      )}`
    );
  }

  if (gotchas.length > 0) {
    sections.push(
      `## Missing context — ask the user\n\n${numbered(
        gotchas.map(
          (issue) =>
            `${getFixPromptLine(issue.violation)} (rule id: ${issue.violation.ruleId})`
        )
      )}`
    );
    sections.push(ANNOTATION_FORMAT_SPEC);
  }

  sections.push(
    "When you are done, the user will re-run the CanICode plugin analysis on the same selection to verify the fixes."
  );

  return sections.join("\n\n");
}
