import type { Category } from "../contracts/category.js";
import type { RuleId, RuleViolation } from "../contracts/rule.js";
import type { AnalysisIssue } from "../engine/rule-engine.js";
import { RULE_ID_CATEGORY } from "../rules/rule-config.js";
import { ANNOTATION_FORMAT_SPEC, buildFixPrompt } from "./build-fix-prompt.js";

function makeIssue(
  ruleId: string,
  overrides: Partial<AnalysisIssue> & { violation?: Partial<RuleViolation> } = {}
): AnalysisIssue {
  const category: Category = RULE_ID_CATEGORY[ruleId as RuleId] ?? "semantic";
  const { violation: violationOverrides, ...issueOverrides } = overrides;
  return {
    violation: {
      ruleId,
      nodeId: "12:34",
      nodePath: `Page 1 > Section > Node-${ruleId}`,
      message: `"Node-${ruleId}" violates ${ruleId}`,
      suggestion: `Fix ${ruleId}`,
      ...violationOverrides,
    },
    rule: {
      definition: {
        id: ruleId,
        name: ruleId,
        category,
        why: "test",
        impact: "test",
        fix: "test",
      },
      check: () => null,
    },
    config: { severity: "risk", score: -4, enabled: true },
    depth: 1,
    maxDepth: 3,
    calculatedScore: -4,
    ...issueOverrides,
  };
}

describe("buildFixPrompt", () => {
  it("returns an empty string for no issues", () => {
    expect(buildFixPrompt([])).toBe("");
  });

  it("omits the gotcha section and annotation spec when only violations exist", () => {
    const prompt = buildFixPrompt([makeIssue("no-auto-layout")]);
    expect(prompt).toContain("## Fixes to apply");
    expect(prompt).not.toContain("## Missing context");
    expect(prompt).not.toContain("## Annotation format");
  });

  it("includes the annotation spec when gotcha issues exist", () => {
    const prompt = buildFixPrompt([makeIssue("missing-interaction-state")]);
    expect(prompt).toContain("## Missing context — ask the user");
    expect(prompt).toContain(ANNOTATION_FORMAT_SPEC);
    expect(prompt).not.toContain("## Fixes to apply");
  });

  it("filters acknowledged issues", () => {
    const prompt = buildFixPrompt([
      makeIssue("missing-interaction-state", { acknowledged: true }),
      makeIssue("no-auto-layout"),
    ]);
    expect(prompt).not.toContain("missing-interaction-state");
    expect(prompt).toContain("## Fixes to apply");
    expect(prompt).not.toContain("## Annotation format");
  });

  it("returns an empty string when every issue is acknowledged", () => {
    const prompt = buildFixPrompt([
      makeIssue("no-auto-layout", { acknowledged: true }),
    ]);
    expect(prompt).toBe("");
  });

  it("sorts structural fixes first regardless of input order", () => {
    const prompt = buildFixPrompt([
      makeIssue("raw-value"),
      makeIssue("no-auto-layout"),
    ]);
    const structuralIndex = prompt.indexOf("no-auto-layout");
    const tokenIndex = prompt.indexOf("raw-value");
    expect(structuralIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(-1);
    expect(structuralIndex).toBeLessThan(tokenIndex);
  });

  it("keeps document order within the same rule", () => {
    const prompt = buildFixPrompt([
      makeIssue("no-auto-layout", { violation: { nodeId: "1:1", message: "first node" } }),
      makeIssue("no-auto-layout", { violation: { nodeId: "2:2", message: "second node" } }),
    ]);
    expect(prompt.indexOf("first node")).toBeLessThan(prompt.indexOf("second node"));
  });

  it("includes the file name when provided", () => {
    const prompt = buildFixPrompt([makeIssue("no-auto-layout")], {
      fileName: "My Design",
    });
    expect(prompt).toContain('"My Design"');
  });

  it("gotcha items carry the rule id for the annotation footer", () => {
    const prompt = buildFixPrompt([makeIssue("missing-prototype")]);
    expect(prompt).toContain("(rule id: missing-prototype)");
  });
});

describe("ANNOTATION_FORMAT_SPEC", () => {
  // These literals are the roundtrip read/write contract — keep in sync with
  // upsertCanicodeAnnotation (annotations.ts) and FOOTER_RE
  // (read-acknowledgments.ts).
  it("specifies the footer convention and gotcha category", () => {
    expect(ANNOTATION_FORMAT_SPEC).toContain("— *");
    expect(ANNOTATION_FORMAT_SPEC).toContain("canicode:gotcha");
    expect(ANNOTATION_FORMAT_SPEC).toContain("labelMarkdown");
    expect(ANNOTATION_FORMAT_SPEC).toContain("addAnnotationCategoryAsync");
  });
});
