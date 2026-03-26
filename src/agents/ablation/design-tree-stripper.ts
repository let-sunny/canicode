/**
 * Design tree stripper for ablation testing.
 * Removes rule-specific information from a text-based design tree
 * to measure how much harder AI implementation becomes without that info.
 */

import type { RuleId } from "../../core/contracts/rule.js";

/** Pilot rule IDs supported for stripping. */
export const PILOT_RULE_IDS = [
  "no-auto-layout",
  "missing-component",
  "default-name",
] as const satisfies readonly RuleId[];

export type PilotRuleId = (typeof PILOT_RULE_IDS)[number];

/**
 * Strip rule-specific information from a design tree text.
 * Returns a modified design tree with the target rule's information removed.
 *
 * Currently supports pilot rules only:
 * - `no-auto-layout`: removes layout properties (display, flex-direction, gap, align-items, justify-content)
 * - `missing-component`: removes [component: ...] annotations
 * - `default-name`: replaces meaningful node names with generic "Frame 1", "Group 2", etc.
 */
export function stripForRule(designTree: string, ruleId: RuleId): string {
  switch (ruleId) {
    case "no-auto-layout":
      return stripAutoLayout(designTree);
    case "missing-component":
      return stripComponents(designTree);
    case "default-name":
      return stripNames(designTree);
    default:
      throw new Error(`Stripping not implemented for rule: ${ruleId}`);
  }
}

/**
 * Strip auto-layout properties from the design tree.
 * Removes: display, flex-direction, flex-wrap, row-gap, column-gap,
 * justify-content, align-items, align-content, display: grid and grid properties.
 */
function stripAutoLayout(designTree: string): string {
  const lines = designTree.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Check if this is a style line
    const styleMatch = line.match(/^(\s*)style:\s*(.+)$/);
    if (!styleMatch) {
      result.push(line);
      continue;
    }

    const indent = styleMatch[1] ?? "";
    const styleContent = styleMatch[2] ?? "";

    // Parse semicolon-separated CSS properties
    const properties = styleContent.split(";").map((p) => p.trim());

    // Layout-related property prefixes to remove
    const layoutPrefixes = [
      "display:",
      "flex-direction:",
      "flex-wrap:",
      "row-gap:",
      "column-gap:",
      "gap:",
      "justify-content:",
      "align-items:",
      "align-content:",
      "grid-template-columns:",
      "grid-template-rows:",
    ];

    const filtered = properties.filter((prop) => {
      if (!prop) return false;
      return !layoutPrefixes.some((prefix) => prop.startsWith(prefix));
    });

    if (filtered.length > 0) {
      result.push(`${indent}style: ${filtered.join("; ")}`);
    }
    // If no properties remain, omit the entire style line
  }

  return result.join("\n");
}

/**
 * Strip component annotations from the design tree.
 * Removes: [component: ...] annotations from node headers.
 */
function stripComponents(designTree: string): string {
  // Remove [component: ...] annotations from node header lines
  return designTree.replace(/ \[component: [^\]]+\]/g, "");
}

/**
 * Strip meaningful names from the design tree, replacing with generic names.
 * Replaces node names with "Frame 1", "Group 2", "Text 3", etc. based on node type.
 */
function stripNames(designTree: string): string {
  const lines = designTree.split("\n");
  const result: string[] = [];

  // Counter per type for unique generic names
  const typeCounters = new Map<string, number>();

  for (const line of lines) {
    // Skip comment lines (headers)
    if (line.startsWith("#")) {
      result.push(line);
      continue;
    }

    // Match node header lines: indentation + name (TYPE, WxH) [optional component annotation]
    const nodeMatch = line.match(/^(\s*)(.+?)\s+\((\w+),\s*(\S+)\)(.*)$/);
    if (!nodeMatch) {
      result.push(line);
      continue;
    }

    const indent = nodeMatch[1] ?? "";
    const nodeType = nodeMatch[3] ?? "FRAME";
    const dimensions = nodeMatch[4] ?? "?x?";
    const suffix = nodeMatch[5] ?? "";

    // Map Figma node types to readable generic names
    const genericBase = getGenericNameBase(nodeType);
    const count = (typeCounters.get(nodeType) ?? 0) + 1;
    typeCounters.set(nodeType, count);

    const genericName = `${genericBase} ${count}`;
    result.push(`${indent}${genericName} (${nodeType}, ${dimensions})${suffix}`);
  }

  return result.join("\n");
}

/** Map Figma node types to readable generic name bases. */
function getGenericNameBase(nodeType: string): string {
  const typeMap: Record<string, string> = {
    FRAME: "Frame",
    GROUP: "Group",
    TEXT: "Text",
    RECTANGLE: "Rectangle",
    ELLIPSE: "Ellipse",
    VECTOR: "Vector",
    INSTANCE: "Instance",
    COMPONENT: "Component",
    COMPONENT_SET: "ComponentSet",
    BOOLEAN_OPERATION: "BooleanOp",
    LINE: "Line",
    STAR: "Star",
    REGULAR_POLYGON: "Polygon",
    SECTION: "Section",
    SLICE: "Slice",
    DOCUMENT: "Document",
    CANVAS: "Canvas",
  };
  return typeMap[nodeType] ?? "Element";
}
