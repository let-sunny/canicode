import { makeNode, makeFile, makeContext } from "../test-helpers.js";
import type { AnalysisFile } from "../../contracts/figma-node.js";
import { variantNotUsed } from "./index.js";

function makeFileWithVariantComponent(): AnalysisFile {
  return {
    ...makeFile(),
    componentDefinitions: {
      "comp:1": makeNode({
        id: "comp:1",
        type: "COMPONENT",
        name: "Button",
        componentPropertyDefinitions: {
          State: { type: "VARIANT", variantOptions: ["default", "hover", "pressed"] },
          Size: { type: "VARIANT", variantOptions: ["small", "medium", "large"] },
        },
      }),
    },
  };
}

describe("variant-not-used", () => {
  it("has correct rule definition metadata", () => {
    expect(variantNotUsed.definition.id).toBe("variant-not-used");
    expect(variantNotUsed.definition.category).toBe("component");
  });

  it("flags instance that uses no variant overrides", () => {
    const file = makeFileWithVariantComponent();
    const node = makeNode({ type: "INSTANCE", name: "MyButton", componentId: "comp:1" });
    const result = variantNotUsed.check(node, makeContext({ file }));
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("variant-not-used");
    expect(result!.message).toContain("default variant");
  });

  it("flags instance with non-variant property overrides only", () => {
    const file = makeFileWithVariantComponent();
    const node = makeNode({
      type: "INSTANCE",
      name: "MyButton",
      componentId: "comp:1",
      componentProperties: { label: { value: "Submit" } }, // not a variant prop
    });
    const result = variantNotUsed.check(node, makeContext({ file }));
    expect(result).not.toBeNull();
  });

  it("returns null when instance overrides a variant property", () => {
    const file = makeFileWithVariantComponent();
    const node = makeNode({
      type: "INSTANCE",
      name: "MyButton",
      componentId: "comp:1",
      componentProperties: { State: { value: "hover" } },
    });
    expect(variantNotUsed.check(node, makeContext({ file }))).toBeNull();
  });

  it("returns null for non-INSTANCE nodes", () => {
    const node = makeNode({ type: "FRAME" });
    expect(variantNotUsed.check(node, makeContext())).toBeNull();
  });

  it("returns null when component has no variant properties", () => {
    const file: AnalysisFile = {
      ...makeFile(),
      componentDefinitions: {
        "comp:2": makeNode({
          id: "comp:2",
          type: "COMPONENT",
          componentPropertyDefinitions: {
            label: { type: "TEXT" },
          },
        }),
      },
    };
    const node = makeNode({ type: "INSTANCE", componentId: "comp:2" });
    expect(variantNotUsed.check(node, makeContext({ file }))).toBeNull();
  });

  it("returns null when no componentDefinitions in file", () => {
    const node = makeNode({ type: "INSTANCE", componentId: "comp:1" });
    expect(variantNotUsed.check(node, makeContext())).toBeNull();
  });
});
