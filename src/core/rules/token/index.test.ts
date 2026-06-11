import { makeNode, makeContext } from "../test-helpers.js";
import { irregularSpacing } from "./index.js";

describe("irregular-spacing", () => {
  describe("off-grid spacing without variable binding", () => {
    it("flags off-grid paddingLeft", () => {
      const node = makeNode({ paddingLeft: 7 });
      const result = irregularSpacing.check(node, makeContext());
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("irregular-spacing");
      expect(result?.subType).toBe("padding");
    });

    it("flags off-grid itemSpacing", () => {
      const node = makeNode({ itemSpacing: 7 });
      const result = irregularSpacing.check(node, makeContext());
      expect(result).not.toBeNull();
      expect(result?.subType).toBe("gap");
    });
  });

  describe("off-grid spacing bound to a variable", () => {
    it("skips off-grid paddingLeft bound to a local variable", () => {
      const node = makeNode({
        paddingLeft: 7,
        boundVariables: { paddingLeft: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
      });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("skips off-grid paddingRight bound to a variable", () => {
      const node = makeNode({
        paddingRight: 7,
        boundVariables: { paddingRight: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
      });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("skips off-grid paddingTop bound to a variable", () => {
      const node = makeNode({
        paddingTop: 7,
        boundVariables: { paddingTop: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
      });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("skips off-grid paddingBottom bound to a variable", () => {
      const node = makeNode({
        paddingBottom: 7,
        boundVariables: { paddingBottom: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
      });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("skips off-grid itemSpacing bound to a variable", () => {
      const node = makeNode({
        itemSpacing: 7,
        boundVariables: { itemSpacing: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
      });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("skips off-grid itemSpacing bound to a library variable", () => {
      const node = makeNode({
        itemSpacing: 13,
        boundVariables: {
          itemSpacing: { type: "VARIABLE_ALIAS", id: "VariableID:library:42" },
        },
      });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("flags unbound off-grid padding even when another key is bound", () => {
      const node = makeNode({
        paddingLeft: 7,
        paddingRight: 8,
        boundVariables: { paddingRight: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
      });
      const result = irregularSpacing.check(node, makeContext());
      expect(result).not.toBeNull();
      expect(result?.subType).toBe("padding");
    });
  });

  describe("on-grid and exempt values", () => {
    it("returns null for on-grid padding (multiple of 4)", () => {
      const node = makeNode({ paddingLeft: 8, paddingRight: 16, itemSpacing: 4 });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("returns null for common exempt values (1, 2)", () => {
      const node = makeNode({ paddingLeft: 1, itemSpacing: 2 });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });

    it("returns null for node with no spacing properties", () => {
      const node = makeNode({ type: "TEXT" });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
    });
  });
});
