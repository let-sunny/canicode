import type { RuleId, RuleViolation } from "../contracts/rule.js";
import {
  FIX_PROMPT_TEMPLATES,
  fallbackFixPromptLine,
  getFixPromptLine,
  violationNodeName,
} from "./fix-prompt-templates.js";
import { RULE_PURPOSE } from "./rule-config.js";

function makeViolation(ruleId: string): RuleViolation {
  return {
    ruleId,
    nodeId: "12:34",
    nodePath: "Page 1 > Section > Card",
    message: `"Card" has a problem detected by ${ruleId}`,
    suggestion: "Fix the problem",
  };
}

describe("getFixPromptLine", () => {
  const allRuleIds = Object.keys(RULE_PURPOSE) as RuleId[];

  it("produces a non-empty line for every rule id", () => {
    for (const ruleId of allRuleIds) {
      const line = getFixPromptLine(makeViolation(ruleId));
      expect(line.length, ruleId).toBeGreaterThan(0);
      expect(line, ruleId).toContain("12:34");
    }
  });

  it("has a registry template for every rule id", () => {
    for (const ruleId of allRuleIds) {
      expect(FIX_PROMPT_TEMPLATES[ruleId], ruleId).toBeTypeOf("function");
    }
  });

  it("info-collection rules instruct the agent to ask the user and annotate", () => {
    const gotchaRuleIds = allRuleIds.filter(
      (id) => RULE_PURPOSE[id] === "info-collection"
    );
    expect(gotchaRuleIds.length).toBeGreaterThan(0);
    for (const ruleId of gotchaRuleIds) {
      const line = getFixPromptLine(makeViolation(ruleId));
      expect(line, ruleId).toContain("Ask the user");
      expect(line, ruleId).toContain("annotation");
      // The agent phrases the question itself — no authored question text.
      expect(line, ruleId).not.toContain("?");
    }
  });

  it("violation rules produce an imperative fix line with message and suggestion", () => {
    const v = makeViolation("no-auto-layout");
    const line = getFixPromptLine(v);
    expect(line).toContain(v.message);
    expect(line).toContain(v.suggestion);
    expect(line).not.toContain("Ask the user");
  });

  it("falls back for unknown rule ids without crashing", () => {
    const v = makeViolation("some-future-rule");
    const line = getFixPromptLine(v);
    expect(line).toBe(fallbackFixPromptLine(v));
    expect(line).toContain(v.message);
    expect(line).toContain(v.suggestion);
    expect(line).toContain("(node 12:34)");
  });
});

describe("violationNodeName", () => {
  it("derives the name from the last nodePath segment", () => {
    expect(violationNodeName(makeViolation("raw-value"))).toBe("Card");
  });

  it("falls back to nodeId when nodePath is empty", () => {
    const v = { ...makeViolation("raw-value"), nodePath: "" };
    expect(violationNodeName(v)).toBe("12:34");
  });
});
