import type { RuleContext } from "../../contracts/rule.js";
import type { AnalysisFile, AnalysisNode } from "../../contracts/figma-node.js";
import { noAutoLayout } from "./index.js";

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

describe("no-auto-layout", () => {
  it("has correct rule definition metadata", () => {
    const def = noAutoLayout.definition;
    expect(def.id).toBe("no-auto-layout");
    expect(def.category).toBe("layout");
    expect(def.why).toContain("Auto Layout");
    expect(def.fix).toContain("Auto Layout");
  });

  it("returns null for non-FRAME nodes", () => {
    const textNode = makeNode({ type: "TEXT" });
    const ctx = makeContext();
    expect(noAutoLayout.check(textNode, ctx)).toBeNull();

    const groupNode = makeNode({ type: "GROUP" });
    expect(noAutoLayout.check(groupNode, ctx)).toBeNull();
  });

  it("returns null for frame with auto layout", () => {
    const node = makeNode({
      layoutMode: "HORIZONTAL",
      children: [makeNode({ id: "c:1", name: "Child" })],
    });
    const ctx = makeContext();
    expect(noAutoLayout.check(node, ctx)).toBeNull();
  });

  it("returns null for empty frame (no children)", () => {
    const node = makeNode({ children: [] });
    const ctx = makeContext();
    expect(noAutoLayout.check(node, ctx)).toBeNull();
  });

  it("returns null for frame without children property", () => {
    const node = makeNode({});
    const ctx = makeContext();
    expect(noAutoLayout.check(node, ctx)).toBeNull();
  });

  it("flags frame without auto layout that has children", () => {
    const child = makeNode({ id: "c:1", name: "Child" });
    const node = makeNode({ name: "Container", children: [child] });
    const ctx = makeContext();

    const result = noAutoLayout.check(node, ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("no-auto-layout");
    expect(result!.message).toContain("Container");
    expect(result!.message).toContain("no Auto Layout");
  });

  it("flags frame with layoutMode NONE that has children", () => {
    const child = makeNode({ id: "c:1", name: "Child" });
    const node = makeNode({
      name: "NoneLayout",
      layoutMode: "NONE",
      children: [child],
    });
    const ctx = makeContext();

    const result = noAutoLayout.check(node, ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("no-auto-layout");
    expect(result!.message).toContain("NoneLayout");
  });
});
