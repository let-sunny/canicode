import { stripForRule, PILOT_RULE_IDS } from "./design-tree-stripper.js";

// Sample design tree for testing
const SAMPLE_TREE = `# Design Tree
# Root: 375px x 812px
# Each node shows: name (TYPE, WxH) followed by CSS-like styles
# Reproduce this tree as HTML. Each node = one HTML element.
# Every style value is from Figma data — use exactly as shown.

Hero Section (FRAME, 375x812)
  style: display: flex; flex-direction: column; row-gap: 32px; padding: 24px 16px 24px 16px; background: #FFFFFF
  Navigation Bar (FRAME, 343x48)
    style: display: flex; flex-direction: row; column-gap: 12px; justify-content: space-between; align-items: center
    Logo (INSTANCE, 120x40) [component: BrandLogo]
      style: background-image: [IMAGE]
    Menu Button (INSTANCE, 40x40) [component: IconButton]
      style: border-radius: 8px; background: #F5F5F5
  Title (TEXT, 311x48)
    style: font-family: "Inter"; font-weight: 700; font-size: 48px; color: #2C2C2C; text: "Welcome Home"
  Card Container (FRAME, 343x200)
    style: display: flex; flex-direction: column; row-gap: 16px; padding: 16px 16px 16px 16px; border-radius: 12px; background: #F9F9F9
    Card Title (TEXT, 311x24)
      style: font-family: "Inter"; font-weight: 600; font-size: 20px; color: #333333; text: "Featured"
    Card Body (TEXT, 311x72)
      style: font-family: "Inter"; font-weight: 400; font-size: 14px; line-height: 24px; color: #666666; text: "This is the card body text"`;

describe("stripForRule", () => {
  describe("no-auto-layout", () => {
    it("removes layout properties from style lines", () => {
      const result = stripForRule(SAMPLE_TREE, "no-auto-layout");

      expect(result).not.toContain("display: flex");
      expect(result).not.toContain("flex-direction:");
      expect(result).not.toContain("row-gap:");
      expect(result).not.toContain("column-gap:");
      expect(result).not.toContain("justify-content:");
      expect(result).not.toContain("align-items:");
    });

    it("preserves non-layout style properties", () => {
      const result = stripForRule(SAMPLE_TREE, "no-auto-layout");

      expect(result).toContain("padding: 24px 16px 24px 16px");
      expect(result).toContain("background: #FFFFFF");
      expect(result).toContain("border-radius: 12px");
      expect(result).toContain('font-family: "Inter"');
      expect(result).toContain("font-weight: 700");
      expect(result).toContain("color: #2C2C2C");
    });

    it("preserves node headers and comment lines", () => {
      const result = stripForRule(SAMPLE_TREE, "no-auto-layout");

      expect(result).toContain("# Design Tree");
      expect(result).toContain("Hero Section (FRAME, 375x812)");
      expect(result).toContain("Navigation Bar (FRAME, 343x48)");
      expect(result).toContain("Title (TEXT, 311x48)");
    });

    it("omits style line entirely when all properties are layout-only", () => {
      const layoutOnlyTree = `Root (FRAME, 100x100)
  style: display: flex; flex-direction: row; column-gap: 8px`;

      const result = stripForRule(layoutOnlyTree, "no-auto-layout");

      expect(result).toBe("Root (FRAME, 100x100)");
    });

    it("handles grid layout properties", () => {
      const gridTree = `Container (FRAME, 600x400)
  style: display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 8px 8px 8px 8px`;

      const result = stripForRule(gridTree, "no-auto-layout");

      expect(result).not.toContain("display: grid");
      expect(result).not.toContain("grid-template-columns:");
      expect(result).not.toContain("gap:");
      expect(result).toContain("padding: 8px 8px 8px 8px");
    });
  });

  describe("missing-component", () => {
    it("removes [component: ...] annotations from node headers", () => {
      const result = stripForRule(SAMPLE_TREE, "missing-component");

      expect(result).not.toContain("[component: BrandLogo]");
      expect(result).not.toContain("[component: IconButton]");
      expect(result).not.toContain("[component:");
    });

    it("preserves node names and types after removing component annotations", () => {
      const result = stripForRule(SAMPLE_TREE, "missing-component");

      expect(result).toContain("Logo (INSTANCE, 120x40)");
      expect(result).toContain("Menu Button (INSTANCE, 40x40)");
    });

    it("preserves all style properties", () => {
      const result = stripForRule(SAMPLE_TREE, "missing-component");

      expect(result).toContain("display: flex");
      expect(result).toContain("flex-direction: column");
      expect(result).toContain('font-family: "Inter"');
    });

    it("handles design trees with no component annotations", () => {
      const noComponents = `Root (FRAME, 100x100)
  style: background: #FFF
  Child (TEXT, 80x20)
    style: text: "Hello"`;

      const result = stripForRule(noComponents, "missing-component");

      expect(result).toBe(noComponents);
    });
  });

  describe("default-name", () => {
    it("replaces meaningful names with generic names based on type", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");

      // Original meaningful names should not appear as node names
      expect(result).not.toContain("Hero Section (FRAME");
      expect(result).not.toContain("Navigation Bar (FRAME");
      expect(result).not.toContain("Logo (INSTANCE");
      expect(result).not.toContain("Title (TEXT");
      expect(result).not.toContain("Card Container (FRAME");
    });

    it("uses correct type-based generic names", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");

      // Should contain Frame N, Text N, Instance N patterns
      expect(result).toMatch(/Frame \d+ \(FRAME,/);
      expect(result).toMatch(/Text \d+ \(TEXT,/);
      expect(result).toMatch(/Instance \d+ \(INSTANCE,/);
    });

    it("assigns incrementing numbers per type", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");
      const lines = result.split("\n");

      // Find all FRAME-typed nodes
      const frameLines = lines.filter((l) => l.match(/Frame \d+ \(FRAME,/));
      expect(frameLines.length).toBeGreaterThan(1);

      // Numbers should increment
      const numbers = frameLines.map((l) => {
        const m = l.match(/Frame (\d+)/);
        return m ? parseInt(m[1]!, 10) : 0;
      });
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBeGreaterThan(numbers[i - 1]!);
      }
    });

    it("preserves comment lines unchanged", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");

      expect(result).toContain("# Design Tree");
      expect(result).toContain("# Root: 375px x 812px");
    });

    it("preserves style lines unchanged", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");

      expect(result).toContain("display: flex; flex-direction: column");
      expect(result).toContain('font-family: "Inter"');
      expect(result).toContain('text: "Welcome Home"');
    });

    it("preserves dimensions and type info", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");

      expect(result).toContain("(FRAME, 375x812)");
      expect(result).toContain("(TEXT, 311x48)");
      expect(result).toContain("(INSTANCE, 120x40)");
    });

    it("preserves component annotations", () => {
      const result = stripForRule(SAMPLE_TREE, "default-name");

      expect(result).toContain("[component: BrandLogo]");
      expect(result).toContain("[component: IconButton]");
    });
  });

  describe("unsupported rules", () => {
    it("throws error for non-pilot rules", () => {
      expect(() => stripForRule(SAMPLE_TREE, "raw-color")).toThrow(
        "Stripping not implemented for rule: raw-color"
      );
    });
  });

  describe("PILOT_RULE_IDS", () => {
    it("contains exactly the 3 pilot rules", () => {
      expect(PILOT_RULE_IDS).toEqual([
        "no-auto-layout",
        "missing-component",
        "default-name",
      ]);
    });

    it("all pilot rules have working strip implementations", () => {
      for (const ruleId of PILOT_RULE_IDS) {
        const result = stripForRule(SAMPLE_TREE, ruleId);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
