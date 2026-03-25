import type { RuleContext } from "../../contracts/rule.js";
import type { AnalysisFile, AnalysisNode } from "../../contracts/figma-node.js";
import { absolutePositionInAutoLayout } from "./index.js";

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

describe("absolute-position-in-auto-layout", () => {
  it("has correct rule definition metadata", () => {
    const def = absolutePositionInAutoLayout.definition;
    expect(def.id).toBe("absolute-position-in-auto-layout");
    expect(def.category).toBe("layout");
    expect(def.why).toContain("Absolute positioning");
    expect(def.fix).toContain("absolute positioning");
  });

  it("returns null when no parent", () => {
    const node = makeNode({ layoutPositioning: "ABSOLUTE" });
    const ctx = makeContext({ parent: undefined });
    expect(absolutePositionInAutoLayout.check(node, ctx)).toBeNull();
  });

  it("returns null when parent has no auto layout", () => {
    const parent = makeNode({ id: "p:1", name: "Parent" });
    const node = makeNode({ layoutPositioning: "ABSOLUTE" });
    const ctx = makeContext({ parent });
    expect(absolutePositionInAutoLayout.check(node, ctx)).toBeNull();
  });

  it("returns null for non-absolute node", () => {
    const parent = makeNode({
      id: "p:1",
      name: "Parent",
      layoutMode: "HORIZONTAL",
    });
    const node = makeNode({ layoutPositioning: "AUTO" });
    const ctx = makeContext({ parent });
    expect(absolutePositionInAutoLayout.check(node, ctx)).toBeNull();
  });

  it("flags absolute positioned node in auto layout parent", () => {
    const parent = makeNode({
      id: "p:1",
      name: "AutoParent",
      layoutMode: "HORIZONTAL",
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
    });
    const node = makeNode({
      name: "AbsChild",
      layoutPositioning: "ABSOLUTE",
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const ctx = makeContext({ parent });

    const result = absolutePositionInAutoLayout.check(node, ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("absolute-position-in-auto-layout");
    expect(result!.message).toContain("AbsChild");
    expect(result!.message).toContain("absolute positioning");
  });

  it("skips vector/graphic nodes", () => {
    const parent = makeNode({
      id: "p:1",
      name: "Parent",
      layoutMode: "HORIZONTAL",
    });
    const vectorNode = makeNode({
      type: "VECTOR",
      layoutPositioning: "ABSOLUTE",
    });
    const ctx = makeContext({ parent });
    expect(absolutePositionInAutoLayout.check(vectorNode, ctx)).toBeNull();
  });

  it("skips nodes inside COMPONENT parent", () => {
    const parent = makeNode({
      id: "p:1",
      name: "CompParent",
      type: "COMPONENT",
      layoutMode: "VERTICAL",
    });
    const node = makeNode({
      name: "InnerNode",
      layoutPositioning: "ABSOLUTE",
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const ctx = makeContext({ parent });
    expect(absolutePositionInAutoLayout.check(node, ctx)).toBeNull();
  });

  it("skips small decorations (< 25% parent size)", () => {
    const parent = makeNode({
      id: "p:1",
      name: "BigParent",
      layoutMode: "HORIZONTAL",
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
    });
    const smallNode = makeNode({
      name: "SmallBadge",
      layoutPositioning: "ABSOLUTE",
      absoluteBoundingBox: { x: 0, y: 0, width: 20, height: 20 },
    });
    const ctx = makeContext({ parent });
    expect(absolutePositionInAutoLayout.check(smallNode, ctx)).toBeNull();
  });
});
