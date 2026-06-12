/**
 * Per-rule fix-prompt templates (#587).
 *
 * Turns one RuleViolation into one deterministic instruction line for the
 * copy-as-prompt feature. The lines are pasted into the host design agent
 * (e.g. Figma's native AI agent) which executes the fixes — canicode only
 * directs the fix, it never executes (ADR-013).
 *
 * Two line shapes, mirroring the rule purpose split (ADR-017):
 * - violation rules → imperative fix instruction. The centralized
 *   message/suggestion strings (rule-messages.ts) are already node-specific
 *   and imperative, so most templates re-frame them with the node id appended.
 * - info-collection (gotcha) rules → "ask the user" instruction. The agent
 *   phrases the question itself in designer-friendly words — we deliberately
 *   do NOT author question text — then records the answer as a canicode
 *   annotation so re-analysis can detect the gotcha as resolved.
 */

import type { RuleId, RuleViolation } from "../contracts/rule.js";

/**
 * Display name for a violation's node. RuleViolation has no nodeName field;
 * nodePath is the " > "-joined name chain whose last segment is the node's
 * own name (rule-engine builds it as [...path, node.name]).
 */
export function violationNodeName(v: RuleViolation): string {
  const segments = v.nodePath.split(" > ");
  const last = segments[segments.length - 1];
  const trimmed = last?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : v.nodeId;
}

/**
 * Generic fallback — covers unknown/future rule ids so the prompt builder
 * never crashes. message and suggestion are already node-specific.
 */
export function fallbackFixPromptLine(v: RuleViolation): string {
  return `${v.message} — ${v.suggestion} (node ${v.nodeId})`;
}

/** Imperative fix line for violation rules: message + suggestion + node id. */
function imperativeFix(v: RuleViolation): string {
  return `${v.message}. ${v.suggestion} (node ${v.nodeId}).`;
}

/**
 * Ask-the-user line for info-collection rules. `missingContext` describes
 * WHAT is unknown — never an authored question — so the agent phrases the
 * question itself. The trailing annotation instruction is what closes the
 * verify loop: re-analysis reads the annotation back (read-acknowledgments.ts).
 */
function askUser(v: RuleViolation, missingContext: string): string {
  return (
    `${v.message} (node ${v.nodeId}). Ask the user, in your own designer-friendly words, ` +
    `${missingContext}, then record the answer as an annotation on this node ` +
    `(see "Annotation format" below).`
  );
}

/**
 * Registry of per-rule template functions. Violation rules share the
 * imperative shape; info-collection rules (RULE_PURPOSE in rule-config.ts)
 * get rule-specific missing-context descriptions. Rules absent here fall
 * back to fallbackFixPromptLine via getFixPromptLine.
 */
export const FIX_PROMPT_TEMPLATES: Partial<
  Record<RuleId, (v: RuleViolation) => string>
> = {
  // ── Violation rules — imperative fix instructions ──
  "no-auto-layout": imperativeFix,
  "absolute-position-in-auto-layout": imperativeFix,
  "non-layout-container": imperativeFix,
  "fixed-size-in-auto-layout": imperativeFix,
  "missing-component": imperativeFix,
  "detached-instance": imperativeFix,
  "variant-structure-mismatch": imperativeFix,
  "deep-nesting": imperativeFix,
  "raw-value": imperativeFix,
  "irregular-spacing": imperativeFix,
  "non-standard-naming": imperativeFix,
  "non-semantic-name": imperativeFix,
  "inconsistent-naming-convention": imperativeFix,

  // ── Info-collection (gotcha) rules — ask the user, then annotate ──
  "missing-size-constraint": (v) =>
    askUser(
      v,
      "how this element should behave when the screen size changes — stretch with the layout, stay fixed, or respect min/max bounds"
    ),
  "missing-interaction-state": (v) =>
    askUser(v, "what this element should look like in that interaction state"),
  "missing-prototype": (v) =>
    askUser(v, "what should happen when the user interacts with this element"),
  "unmapped-component": (v) =>
    askUser(
      v,
      "whether this component should be mapped to an existing code component, and if so which one"
    ),
};

/** Resolve a violation to its prompt line — registry entry or fallback. */
export function getFixPromptLine(v: RuleViolation): string {
  const template = FIX_PROMPT_TEMPLATES[v.ruleId as RuleId];
  return template ? template(v) : fallbackFixPromptLine(v);
}
