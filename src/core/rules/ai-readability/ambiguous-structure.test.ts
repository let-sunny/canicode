import type { RuleContext } from "../../contracts/rule.js";
import type { AnalysisFile, AnalysisNode } from "../../contracts/figma-node.js";
import { ambiguousStructure } from "./index.js";

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

describe("ambiguous-structure", () => {
  it("has correct rule definition metadata", () => {
    const def = ambiguousStructure.definition;
    expect(def.id).toBe("ambiguous-structure");
    expect(def.category).toBe("ai-readability");
    expect(def.why).toContain("Overlapping");
    expect(def.fix).toContain("Auto Layout");
  });

  it("returns null for non-container nodes", () => {
    const node = makeNode({ type: "TEXT" });
    const ctx = makeContext();
    expect(ambiguousStructure.check(node, ctx)).toBeNull();
  });

  it("returns null for container with auto layout", () => {
    const child1 = makeNode({ id: "c:1" });
    const child2 = makeNode({ id: "c:2" });
    const node = makeNode({
      layoutMode: "HORIZONTAL",
      children: [child1, child2],
    });
    const ctx = makeContext();
    expect(ambiguousStructure.check(node, ctx)).toBeNull();
  });

  it("returns null for container with only 1 child", () => {
    const child = makeNode({ id: "c:1" });
    const node = makeNode({ children: [child] });
    const ctx = makeContext();
    expect(ambiguousStructure.check(node, ctx)).toBeNull();
  });

  it("returns null for non-overlapping children", () => {
    const child1 = makeNode({
      id: "c:1",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const child2 = makeNode({
      id: "c:2",
      absoluteBoundingBox: { x: 200, y: 0, width: 100, height: 100 },
    });
    const node = makeNode({
      name: "Container",
      children: [child1, child2],
      layoutMode: undefined,
    });
    const ctx = makeContext();
    expect(ambiguousStructure.check(node, ctx)).toBeNull();
  });

  it("flags container with overlapping visible children", () => {
    const child1 = makeNode({
      id: "c:1",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const child2 = makeNode({
      id: "c:2",
      absoluteBoundingBox: { x: 50, y: 50, width: 100, height: 100 },
    });
    const node = makeNode({
      name: "Ambiguous",
      children: [child1, child2],
      layoutMode: undefined,
    });
    const ctx = makeContext();

    const result = ambiguousStructure.check(node, ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("ambiguous-structure");
    expect(result!.message).toContain("Ambiguous");
    expect(result!.message).toContain("overlapping");
  });

  it("returns null when overlapping children are hidden", () => {
    const child1 = makeNode({
      id: "c:1",
      visible: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const child2 = makeNode({
      id: "c:2",
      absoluteBoundingBox: { x: 50, y: 50, width: 100, height: 100 },
    });
    const node = makeNode({
      name: "Container",
      children: [child1, child2],
      layoutMode: undefined,
    });
    const ctx = makeContext();
    expect(ambiguousStructure.check(node, ctx)).toBeNull();
  });

  it("works with GROUP container type", () => {
    const child1 = makeNode({
      id: "c:1",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const child2 = makeNode({
      id: "c:2",
      absoluteBoundingBox: { x: 50, y: 50, width: 100, height: 100 },
    });
    const node = makeNode({
      name: "GroupContainer",
      type: "GROUP",
      children: [child1, child2],
      layoutMode: undefined,
    });
    const ctx = makeContext();

    const result = ambiguousStructure.check(node, ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("ambiguous-structure");
  });
});
