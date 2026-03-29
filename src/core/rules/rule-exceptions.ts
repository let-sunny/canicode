import type { AnalysisNode } from "../contracts/figma-node.js";
import type { RuleContext } from "../contracts/rule.js";
import { isVisualLeafType, isVisualOnlyNode, isExcludedName } from "./node-semantics.js";

// Re-export for existing consumers
export { isVisualLeafType, isVisualOnlyNode, hasImageFill } from "./node-semantics.js";

// ============================================
// Auto-layout exceptions
// ============================================

/** Frames that don't need auto-layout (only visual-leaf children like icon paths) */
export function isAutoLayoutExempt(node: AnalysisNode): boolean {
  if (
    node.children &&
    node.children.length > 0 &&
    node.children.every((c) => isVisualLeafType(c.type))
  ) return true;

  return false;
}

// ============================================
// Absolute-position exceptions
// ============================================

/** Nodes that are allowed to use absolute positioning inside auto-layout */
export function isAbsolutePositionExempt(node: AnalysisNode): boolean {
  if (isVisualOnlyNode(node)) return true;

  // Intentional name patterns (badge, close, overlay, etc.)
  if (isExcludedName(node.name)) return true;

  return false;
}

// ============================================
// Size-constraint exceptions
// ============================================

/** Nodes that don't need maxWidth even with FILL sizing */
export function isSizeConstraintExempt(node: AnalysisNode, context: RuleContext): boolean {
  // Already has maxWidth
  if (node.maxWidth !== undefined) return true;

  // Small elements — won't stretch problematically
  if (node.absoluteBoundingBox && node.absoluteBoundingBox.width <= 200) return true;

  // Parent already has maxWidth — parent constrains the stretch
  if (context.parent?.maxWidth !== undefined) return true;

  // Root-level frames — they represent the screen itself
  if (context.depth <= 1) return true;

  // All siblings are FILL (e.g. single item or list view) — parent controls the width
  if (context.siblings && context.siblings.length > 0) {
    if (context.siblings.every((s) => s.layoutSizingHorizontal === "FILL")) return true;
  }

  // Inside grid layout — grid controls sizing
  if (context.parent?.layoutMode === "GRID") return true;

  // Inside flex wrap — wrap layout controls sizing per row
  if (context.parent?.layoutWrap === "WRAP") return true;

  // Text nodes — content length provides natural sizing
  if (node.type === "TEXT") return true;

  return false;
}

// ============================================
// Fixed-size exceptions
// ============================================

/** Nodes that are allowed to use fixed sizing inside auto-layout */
export function isFixedSizeExempt(node: AnalysisNode): boolean {
  // Small fixed elements (icons, avatars) — intentionally fixed
  if (node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    if (width <= 48 && height <= 48) return true;
  }

  if (isVisualOnlyNode(node)) return true;

  // Excluded names (nav, header, etc.)
  if (isExcludedName(node.name)) return true;

  return false;
}
