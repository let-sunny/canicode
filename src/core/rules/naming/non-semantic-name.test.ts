import { makeNode, makeFile, makeContext } from "../test-helpers.js";
import { nonSemanticName } from "./index.js";

describe("non-semantic-name", () => {
  it("has correct rule definition metadata", () => {
    expect(nonSemanticName.definition.id).toBe("non-semantic-name");
    expect(nonSemanticName.definition.category).toBe("minor");
  });

  // Default name detection (merged from default-name)
  it.each([
    "Frame 1",
    "Frame",
    "Group 12",
    "Ellipse",
    "Vector 1",
    "Line 5",
    "Text 2",
    "Component 1",
    "Instance 3",
  ])("flags Figma default name: %s", (name) => {
    const node = makeNode({ name });
    const result = nonSemanticName.check(node, makeContext());
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("non-semantic-name");
    expect(result!.subType).toBeDefined();
  });

  // Shape name detection (names only in NON_SEMANTIC_NAMES, not DEFAULT_NAME_PATTERNS)
  it.each(["polygon", "star", "path", "shape", "fill", "stroke"])(
    "flags shape name: %s (on container)",
    (name) => {
      const node = makeNode({ type: "FRAME", name, children: [makeNode()] });
      const result = nonSemanticName.check(node, makeContext());
      expect(result).not.toBeNull();
      expect(result!.subType).toBe("shape-name");
    },
  );

  // Names that overlap DEFAULT_NAME_PATTERNS — caught as default names, not shape names
  it.each(["ellipse", "vector", "line"])(
    "flags %s as default name (overlaps with Figma defaults)",
    (name) => {
      const node = makeNode({ type: "FRAME", name, children: [makeNode()] });
      const result = nonSemanticName.check(node, makeContext());
      expect(result).not.toBeNull();
      expect(result!.subType).not.toBe("shape-name"); // caught by isDefaultName first
    },
  );

  // Exclusions
  it.each(["rectangle", "image"])(
    "returns null for %s (excluded by name pattern)",
    (name) => {
      const node = makeNode({ type: "FRAME", name, children: [makeNode()] });
      expect(nonSemanticName.check(node, makeContext())).toBeNull();
    },
  );

  it("allows shape names on leaf shape primitives", () => {
    const node = makeNode({ type: "ELLIPSE" as any, name: "polygon" });
    expect(nonSemanticName.check(node, makeContext())).toBeNull();
  });

  it("returns null for semantic names", () => {
    const node = makeNode({ name: "ProductCard" });
    expect(nonSemanticName.check(node, makeContext())).toBeNull();
  });

  it("returns null for excluded name patterns", () => {
    const node = makeNode({ name: "Icon Badge" });
    expect(nonSemanticName.check(node, makeContext())).toBeNull();
  });
});
