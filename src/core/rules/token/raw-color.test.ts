import type { RuleContext } from "../../contracts/rule.js";
import type { AnalysisFile, AnalysisNode } from "../../contracts/figma-node.js";
import { rawColor } from "./index.js";

function makeNode(overrides?: Partial<AnalysisNode>): AnalysisNode {
  return {
    id: "1:1",
    name: "TestNode",
    type: "FRAME",
    visible: true,
    ...overrides,
  };
}

function makeFile(): AnalysisFile {
  return {
    fileKey: "test-file",
    name: "Test File",
    lastModified: "2026-01-01T00:00:00Z",
    version: "1",
    document: makeNode({ id: "0:1", name: "Document", type: "DOCUMENT" }),
    components: {},
    styles: {},
  };
}

function makeContext(overrides?: Partial<RuleContext>): RuleContext {
  return {
    file: makeFile(),
    depth: 2,
    componentDepth: 0,
    maxDepth: 10,
    path: ["Page", "Section"],
    analysisState: new Map(),
    ...overrides,
  };
}

describe("raw-color", () => {
  it("has correct rule definition metadata", () => {
    const def = rawColor.definition;
    expect(def.id).toBe("raw-color");
    expect(def.category).toBe("token");
    expect(def.why).toContain("Raw hex colors");
    expect(def.fix).toContain("color style or variable");
  });

  it("returns null for nodes without fills", () => {
    const node = makeNode({});
    const ctx = makeContext();
    expect(rawColor.check(node, ctx)).toBeNull();
  });

  it("returns null for empty fills array", () => {
    const node = makeNode({ fills: [] });
    const ctx = makeContext();
    expect(rawColor.check(node, ctx)).toBeNull();
  });

  it("returns null when fill style is applied", () => {
    const node = makeNode({
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      styles: { fill: "S:style-id" },
    });
    const ctx = makeContext();
    expect(rawColor.check(node, ctx)).toBeNull();
  });

  it("returns null when fills variable is bound", () => {
    const node = makeNode({
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      boundVariables: { fills: "var-id" },
    });
    const ctx = makeContext();
    expect(rawColor.check(node, ctx)).toBeNull();
  });

  it("flags solid fill without style or variable", () => {
    const node = makeNode({
      name: "RawBox",
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
    });
    const ctx = makeContext();

    const result = rawColor.check(node, ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("raw-color");
    expect(result!.message).toContain("RawBox");
    expect(result!.message).toContain("raw color");
  });

  it("returns null for gradient fills (non-SOLID)", () => {
    const node = makeNode({
      fills: [{ type: "GRADIENT_LINEAR" }],
    });
    const ctx = makeContext();
    expect(rawColor.check(node, ctx)).toBeNull();
  });
});
