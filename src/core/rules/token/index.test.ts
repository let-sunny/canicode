import { makeNode, makeContext } from "../test-helpers.js";
import { rawValue, irregularSpacing } from "./index.js";

describe("raw-value", () => {
  describe("fill color Path B — fills[i].boundVariables", () => {
    it("does not flag a SOLID fill whose fill object carries a color variable binding", () => {
      const node = makeNode({
        type: "FRAME",
        fills: [
          {
            type: "SOLID",
            color: { r: 1, g: 0, b: 0 },
            boundVariables: { color: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
          },
        ],
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });

    it("flags a SOLID fill whose fill object carries an empty boundVariables", () => {
      const node = makeNode({
        type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, boundVariables: {} }],
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("color");
    });

    it("flags a SOLID fill with no boundVariables on the fill object", () => {
      const node = makeNode({
        type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("color");
    });

    it("still flags raw opacity when fill has a Path B binding", () => {
      const node = makeNode({
        type: "FRAME",
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, boundVariables: { color: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } } }],
        opacity: 0.5,
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("opacity");
    });

    it("flags a raw SOLID fill sitting next to a variable-bound fill", () => {
      const node = makeNode({
        type: "FRAME",
        fills: [
          {
            type: "SOLID",
            color: { r: 0, g: 0, b: 1 },
            boundVariables: { color: { type: "VARIABLE_ALIAS", id: "VariableID:1:1" } },
          },
          { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
        ],
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("color");
    });
  });

  describe("style references (plugin styles map)", () => {
    it("does not flag a fill backed by a fill style", () => {
      const node = makeNode({
        type: "FRAME",
        styles: { fill: "S:abc123" },
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });

    it("does not flag a TEXT node backed by a text style", () => {
      const node = makeNode({
        type: "TEXT",
        styles: { text: "S:txt456" },
        style: { fontFamily: "Inter", fontSize: 16, fontWeight: 400 },
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });
  });

  describe("shadow variable bindings", () => {
    const dropShadow = {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.25 },
      offset: { x: 0, y: 4 },
      radius: 8,
    };

    it("does not flag a shadow when effects are bound at node level (Path A)", () => {
      const node = makeNode({
        type: "FRAME",
        effects: [dropShadow],
        boundVariables: { effects: [{ type: "VARIABLE_ALIAS", id: "VariableID:2:1" }] },
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });

    it("does not flag a shadow whose effect object carries its own binding (Path B)", () => {
      const node = makeNode({
        type: "FRAME",
        effects: [
          { ...dropShadow, boundVariables: { color: { type: "VARIABLE_ALIAS", id: "VariableID:2:2" } } },
        ],
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });

    it("flags a shadow with an empty boundVariables on the effect object", () => {
      const node = makeNode({
        type: "FRAME",
        effects: [{ ...dropShadow, boundVariables: {} }],
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("shadow");
    });

    it("does not flag a shadow backed by an effect style", () => {
      const node = makeNode({
        type: "FRAME",
        styles: { effect: "S:eff789" },
        effects: [dropShadow],
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });
  });

  describe("gap Auto (space-between)", () => {
    it("does not flag the stale itemSpacing when gap is Auto", () => {
      const node = makeNode({
        type: "INSTANCE",
        layoutMode: "HORIZONTAL",
        primaryAxisAlignItems: "SPACE_BETWEEN",
        itemSpacing: 24,
      });
      expect(rawValue.check(node, makeContext())).toBeNull();
    });

    it("still flags a raw itemSpacing when gap is a fixed number", () => {
      const node = makeNode({
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        primaryAxisAlignItems: "MIN",
        itemSpacing: 24,
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("spacing");
    });

    it("still flags raw padding on a gap-Auto node", () => {
      const node = makeNode({
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        primaryAxisAlignItems: "SPACE_BETWEEN",
        itemSpacing: 24,
        paddingLeft: 12,
      });
      const result = rawValue.check(node, makeContext());
      expect(result?.ruleId).toBe("raw-value");
      expect(result?.subType).toBe("spacing");
    });
  });
});

describe("irregular-spacing", () => {
  describe("off-grid spacing without variable binding", () => {
    it("flags off-grid paddingLeft", () => {
      const node = makeNode({ paddingLeft: 7 });
      const result = irregularSpacing.check(node, makeContext());
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("irregular-spacing");
      expect(result?.subType).toBe("padding");
    });

    it("does not flag off-grid itemSpacing when gap is Auto (space-between)", () => {
      const node = makeNode({ itemSpacing: 7, primaryAxisAlignItems: "SPACE_BETWEEN" });
      expect(irregularSpacing.check(node, makeContext())).toBeNull();
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
