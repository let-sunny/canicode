// CanICode Figma Plugin — Main thread
// Runs in Figma's sandbox with access to Plugin API.
// Transforms plugin node data to AnalysisNode format and sends to UI.

/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 600 });

// ---- Skipped-node tracking ----
// Some Figma getters throw when the underlying node is healthy but its
// parent component set has structural errors. We swallow the throw so the
// rest of the analysis can run, but we record the skip so the UI can
// surface it — silent skips would make scores look mysterious.

type SkippedNodeInfo = {
  id: string;
  name: string;
  reason:
    | "componentProperties"
    | "componentPropertyDefinitions"
    | "getMainComponent";
};

let skippedNodes: SkippedNodeInfo[] = [];

function recordSkip(
  node: SceneNode,
  reason: SkippedNodeInfo["reason"],
): void {
  skippedNodes.push({ id: node.id, name: node.name, reason });
}

// ---- Type guards ----

function hasAutoLayout(
  node: SceneNode
): node is FrameNode | ComponentNode | ComponentSetNode | InstanceNode {
  return (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "COMPONENT_SET" ||
    node.type === "INSTANCE"
  );
}

function hasFills(
  node: SceneNode
): node is SceneNode & { fills: readonly Paint[] } {
  return "fills" in node;
}

function hasStrokes(
  node: SceneNode
): node is SceneNode & { strokes: readonly Paint[] } {
  return "strokes" in node;
}

function hasEffects(
  node: SceneNode
): node is SceneNode & { effects: readonly Effect[] } {
  return "effects" in node;
}

// Bindable fields on Paint / Effect sub-objects (Path B bindings).
const PAINT_BV_KEYS = ["color"] as const;
const EFFECT_BV_KEYS = ["color", "radius", "spread", "offsetX", "offsetY"] as const;

// Serialize a Paint/Effect proxy to a plain object, preserving boundVariables.
// Two proxy quirks force the explicit handling (same root cause as the
// node-level extraction below):
// 1. boundVariables is a non-enumerable getter, so spread drops it.
// 2. The boundVariables proxy only enumerates LOCAL variables via ownKeys —
//    JSON.stringify silently drops library variable keys, so each known key
//    must be read via direct property access.
function serializeSubObject(
  obj: unknown,
  bvKeys: readonly string[],
  label: string
): Record<string, unknown> {
  const plain: Record<string, unknown> = { ...(obj as object) };
  const bv = (obj as { boundVariables?: unknown }).boundVariables;
  if (bv !== undefined && bv !== null) {
    const extracted: Record<string, unknown> = {};
    for (const key of bvKeys) {
      try {
        const val = (bv as Record<string, unknown>)[key];
        if (val !== undefined) {
          extracted[key] = JSON.parse(JSON.stringify(val));
        }
      } catch (e) {
        console.warn(`[canicode] ${label}.boundVariables["${key}"] not serializable:`, e);
      }
    }
    // Catch any enumerable keys outside the known list (future-proofing)
    try {
      for (const key of Object.keys(bv as object)) {
        if (extracted[key] !== undefined) continue;
        const val = (bv as Record<string, unknown>)[key];
        if (val !== undefined) {
          extracted[key] = JSON.parse(JSON.stringify(val));
        }
      }
    } catch (e) {
      console.warn(`[canicode] ${label}.boundVariables enumeration failed:`, e);
    }
    if (Object.keys(extracted).length > 0) {
      plain["boundVariables"] = extracted;
    }
  }
  return plain;
}

// ---- AnalysisNode shape (matches src/contracts/figma-node.ts) ----

interface AnalysisNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  layoutMode?: string;
  layoutAlign?: string;
  layoutPositioning?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  componentId?: string;
  componentPropertyDefinitions?: Record<string, unknown>;
  componentProperties?: Record<string, unknown>;
  styles?: Record<string, string>;
  fills?: unknown[];
  strokes?: unknown[];
  effects?: unknown[];
  cornerRadius?: number;
  boundVariables?: Record<string, unknown>;
  characters?: string;
  style?: Record<string, unknown>;
  devStatus?: { type: string; description?: string };
  isAsset?: boolean;

  // Responsive / size constraints
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  layoutGrow?: 0 | 1;
  constraints?: { horizontal: string; vertical: string };

  // Wrap
  layoutWrap?: string;
  counterAxisSpacing?: number;
  counterAxisAlignContent?: string;

  // Grid layout (container)
  gridRowCount?: number;
  gridColumnCount?: number;
  gridRowGap?: number;
  gridColumnGap?: number;
  gridColumnsSizing?: string;
  gridRowsSizing?: string;

  // Grid layout (child)
  gridChildHorizontalAlign?: string;
  gridChildVerticalAlign?: string;
  gridRowSpan?: number;
  gridColumnSpan?: number;
  gridRowAnchorIndex?: number;
  gridColumnAnchorIndex?: number;

  // Overflow / clip
  clipsContent?: boolean;
  overflowDirection?: string;

  children?: AnalysisNode[];
}

interface AnalysisFile {
  fileKey: string;
  name: string;
  lastModified: string;
  version: string;
  document: AnalysisNode;
  components: Record<
    string,
    { key: string; name: string; description: string }
  >;
  styles: Record<
    string,
    { key: string; name: string; styleType: string }
  >;
}

// ---- Plugin → REST API constraint enum conversion ----

const HORIZONTAL_CONSTRAINT_MAP: Record<string, string> = {
  MIN: "LEFT",
  CENTER: "CENTER",
  MAX: "RIGHT",
  STRETCH: "LEFT_RIGHT",
  SCALE: "SCALE",
};

const VERTICAL_CONSTRAINT_MAP: Record<string, string> = {
  MIN: "TOP",
  CENTER: "CENTER",
  MAX: "BOTTOM",
  STRETCH: "TOP_BOTTOM",
  SCALE: "SCALE",
};

// ---- Transform Figma Plugin nodes to AnalysisNode ----

async function transformPluginNode(node: SceneNode): Promise<AnalysisNode> {
  const result: AnalysisNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  };

  // Bounding box
  if (node.absoluteBoundingBox) {
    result.absoluteBoundingBox = {
      x: node.absoluteBoundingBox.x,
      y: node.absoluteBoundingBox.y,
      width: node.absoluteBoundingBox.width,
      height: node.absoluteBoundingBox.height,
    };
  }

  // Auto-layout properties (FRAME, COMPONENT, COMPONENT_SET, INSTANCE)
  if (hasAutoLayout(node)) {
    if (node.layoutMode && node.layoutMode !== "NONE") {
      result.layoutMode = node.layoutMode;
    }
    result.itemSpacing = node.itemSpacing;
    result.paddingLeft = node.paddingLeft;
    result.paddingRight = node.paddingRight;
    result.paddingTop = node.paddingTop;
    result.paddingBottom = node.paddingBottom;
    if ("layoutAlign" in node) {
      result.layoutAlign = (node as FrameNode).layoutAlign;
    }
    result.layoutSizingHorizontal = node.layoutSizingHorizontal;
    result.layoutSizingVertical = node.layoutSizingVertical;
    if ("primaryAxisAlignItems" in node) {
      result.primaryAxisAlignItems = node.primaryAxisAlignItems;
    }
    if ("counterAxisAlignItems" in node) {
      result.counterAxisAlignItems = node.counterAxisAlignItems;
    }
  }

  // Responsive / size constraints
  if (hasAutoLayout(node)) {
    if ("minWidth" in node && typeof node.minWidth === "number") {
      result.minWidth = node.minWidth;
    }
    if ("maxWidth" in node && typeof node.maxWidth === "number") {
      result.maxWidth = node.maxWidth;
    }
    if ("minHeight" in node && typeof node.minHeight === "number") {
      result.minHeight = node.minHeight;
    }
    if ("maxHeight" in node && typeof node.maxHeight === "number") {
      result.maxHeight = node.maxHeight;
    }
    if ("layoutGrow" in node) {
      result.layoutGrow = (node as FrameNode).layoutGrow as 0 | 1;
    }

    // Wrap
    if ("layoutWrap" in node && node.layoutWrap) {
      result.layoutWrap = node.layoutWrap;
    }
    if ("counterAxisSpacing" in node && typeof node.counterAxisSpacing === "number") {
      result.counterAxisSpacing = node.counterAxisSpacing;
    }
    if ("counterAxisAlignContent" in node) {
      result.counterAxisAlignContent = (node as FrameNode).counterAxisAlignContent;
    }

    // Grid layout (container)
    if (node.layoutMode === "GRID") {
      if ("gridRowCount" in node) result.gridRowCount = node.gridRowCount as number;
      if ("gridColumnCount" in node) result.gridColumnCount = node.gridColumnCount as number;
      if ("gridRowGap" in node) result.gridRowGap = node.gridRowGap as number;
      if ("gridColumnGap" in node) result.gridColumnGap = node.gridColumnGap as number;
      if ("gridColumnsSizing" in node) result.gridColumnsSizing = node.gridColumnsSizing as string;
      if ("gridRowsSizing" in node) result.gridRowsSizing = node.gridRowsSizing as string;
    }
  }

  // Overflow / clip (applies to all container types, not just auto-layout)
  if ("clipsContent" in node && typeof (node as FrameNode).clipsContent === "boolean") {
    result.clipsContent = (node as FrameNode).clipsContent;
  }
  if ("overflowDirection" in node && (node as FrameNode).overflowDirection) {
    result.overflowDirection = (node as FrameNode).overflowDirection;
  }

  // Constraints (Plugin API MIN/MAX/STRETCH → REST API LEFT/RIGHT/LEFT_RIGHT)
  if ("constraints" in node && (node as FrameNode).constraints) {
    const c = (node as FrameNode).constraints;
    result.constraints = {
      horizontal: HORIZONTAL_CONSTRAINT_MAP[c.horizontal] ?? c.horizontal,
      vertical: VERTICAL_CONSTRAINT_MAP[c.vertical] ?? c.vertical,
    };
  }

  // Grid child properties (on any child of a grid parent)
  if ("gridChildHorizontalAlign" in node) {
    result.gridChildHorizontalAlign = (node as unknown as { gridChildHorizontalAlign: string }).gridChildHorizontalAlign;
  }
  if ("gridChildVerticalAlign" in node) {
    result.gridChildVerticalAlign = (node as unknown as { gridChildVerticalAlign: string }).gridChildVerticalAlign;
  }
  if ("gridRowSpan" in node) {
    result.gridRowSpan = (node as unknown as { gridRowSpan: number }).gridRowSpan;
  }
  if ("gridColumnSpan" in node) {
    result.gridColumnSpan = (node as unknown as { gridColumnSpan: number }).gridColumnSpan;
  }
  if ("gridRowAnchorIndex" in node) {
    result.gridRowAnchorIndex = (node as unknown as { gridRowAnchorIndex: number }).gridRowAnchorIndex;
  }
  if ("gridColumnAnchorIndex" in node) {
    result.gridColumnAnchorIndex = (node as unknown as { gridColumnAnchorIndex: number }).gridColumnAnchorIndex;
  }

  // layoutPositioning (for children in auto-layout)
  if ("layoutPositioning" in node) {
    const lp = (node as FrameNode).layoutPositioning;
    if (lp) {
      result.layoutPositioning = lp;
    }
  }

  // Style references (fillStyleId/strokeStyleId/effectStyleId/textStyleId →
  // REST-style `styles` map) so hasStyleReference() works in the plugin
  // channel. figma.mixed is a symbol, so the typeof check skips mixed values;
  // an empty string means no style is applied.
  const styleRefs: Record<string, string> = {};
  const STYLE_ID_KEYS: Array<[prop: string, key: string]> = [
    ["fillStyleId", "fill"],
    ["strokeStyleId", "stroke"],
    ["effectStyleId", "effect"],
    ["textStyleId", "text"],
  ];
  for (const [prop, key] of STYLE_ID_KEYS) {
    if (prop in node) {
      const styleId = (node as unknown as Record<string, unknown>)[prop];
      if (typeof styleId === "string" && styleId !== "") {
        styleRefs[key] = styleId;
      }
    }
  }
  if (Object.keys(styleRefs).length > 0) {
    result.styles = styleRefs;
  }

  // Fills, strokes, effects — serialize as plain arrays
  if (hasFills(node)) {
    const fills = node.fills;
    if (Array.isArray(fills)) {
      result.fills = fills.map((f) => serializeSubObject(f, PAINT_BV_KEYS, "fill"));
    }
  }
  if (hasStrokes(node)) {
    result.strokes = node.strokes.map((s) => serializeSubObject(s, PAINT_BV_KEYS, "stroke"));
  }
  if (hasEffects(node)) {
    result.effects = node.effects.map((effect) => serializeSubObject(effect, EFFECT_BV_KEYS, "effect"));
  }

  // Corner radius
  if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && typeof node.cornerRadius === "number") {
    result.cornerRadius = node.cornerRadius;
  }

  // Bound variables (design tokens)
  // JSON.stringify(node.boundVariables) silently drops library variable keys:
  // Figma's proxy only enumerates local-file variables via ownKeys, but all
  // variables (local + library) are accessible via direct property access (get).
  // Extract each known key explicitly so library bindings survive serialization.
  if ("boundVariables" in node && node.boundVariables) {
    const bv = node.boundVariables as Record<string, unknown>;
    const SCALAR_KEYS = [
      "itemSpacing", "counterAxisSpacing",
      "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
      "opacity",
      "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius",
      "minWidth", "maxWidth", "minHeight", "maxHeight",
      "strokeWeight", "strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight",
      "gridRowGap", "gridColumnGap",
      "width", "height", "characters", "visible",
    ] as const;
    const ARRAY_KEYS = [
      "fills", "strokes", "effects", "layoutGrids",
      "fontFamily", "fontSize", "fontStyle", "fontWeight",
      "letterSpacing", "lineHeight", "paragraphSpacing", "paragraphIndent",
    ] as const;
    const extracted: Record<string, unknown> = {};
    for (const key of [...SCALAR_KEYS, ...ARRAY_KEYS]) {
      try {
        const val = bv[key];
        if (val !== undefined) {
          extracted[key] = JSON.parse(JSON.stringify(val));
        }
      } catch (e) {
        console.warn(`[canicode] boundVariables["${key}"] not serializable:`, e);
      }
    }
    if (Object.keys(extracted).length > 0) {
      result.boundVariables = extracted;
    }
  }

  // Text properties
  if (node.type === "TEXT") {
    result.characters = node.characters;
    // Flatten text style properties
    result.style = {
      fontFamily: node.fontName !== figma.mixed ? (node.fontName as FontName).family : "Mixed",
      fontSize: node.fontSize !== figma.mixed ? node.fontSize : 0,
      fontWeight: node.fontName !== figma.mixed ? (node.fontName as FontName).style : "Mixed",
      lineHeightPx:
        node.lineHeight !== figma.mixed && typeof node.lineHeight === "object"
          ? (node.lineHeight as { value: number }).value ?? 0
          : 0,
      letterSpacing:
        node.letterSpacing !== figma.mixed &&
        typeof node.letterSpacing === "object"
          ? (node.letterSpacing as { value: number }).value ?? 0
          : 0,
    };
  }

  // Component properties — every Figma getter touched here can throw when
  // the underlying component set has structural errors (duplicate variants,
  // missing axes). Failures must not abort the whole analysis pass —
  // skip the field, keep the node, and record the skip so the UI can
  // surface it (`recordSkip`).
  if (node.type === "INSTANCE") {
    try {
      const mainComp = await (node as InstanceNode).getMainComponentAsync();
      if (mainComp) {
        result.componentId = mainComp.id;
      }
    } catch {
      recordSkip(node, "getMainComponent");
    }
    try {
      if (
        "componentProperties" in node &&
        node.componentProperties
      ) {
        result.componentProperties = JSON.parse(
          JSON.stringify(node.componentProperties)
        ) as Record<string, unknown>;
      }
    } catch {
      // Figma throws "Component set for node has existing errors" on
      // `componentProperties` access when the parent set is malformed.
      recordSkip(node, "componentProperties");
    }
  }
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    try {
      if ("componentPropertyDefinitions" in node) {
        result.componentPropertyDefinitions = JSON.parse(
          JSON.stringify(
            (node as ComponentNode).componentPropertyDefinitions
          )
        ) as Record<string, unknown>;
      }
    } catch {
      // Variant components throw when accessing componentPropertyDefinitions.
      recordSkip(node, "componentPropertyDefinitions");
    }
  }

  // Dev status (only on certain node types with devStatus)
  if ("devStatus" in node && (node as FrameNode).devStatus) {
    const ds = (node as FrameNode).devStatus;
    if (ds) {
      result.devStatus = { type: ds.type };
      if (ds.description) {
        result.devStatus.description = ds.description;
      }
    }
  }

  // Recurse children
  if ("children" in node) {
    const container = node as FrameNode & { children: readonly SceneNode[] };
    result.children = await Promise.all(container.children.map(transformPluginNode));
  }

  return result;
}

// ---- Build AnalysisFile from a subtree ----

async function buildAnalysisFile(
  rootNode: SceneNode,
  pageName: string
): Promise<AnalysisFile> {
  // Reset per-run accumulator so previous skips don't leak into this run.
  skippedNodes = [];
  const doc = await transformPluginNode(rootNode);

  // Collect component metadata
  const components: AnalysisFile["components"] = {};
  const styles: AnalysisFile["styles"] = {};

  function collectComponents(node: AnalysisNode): void {
    if (
      node.type === "COMPONENT" ||
      node.type === "COMPONENT_SET"
    ) {
      components[node.id] = {
        key: node.id,
        name: node.name,
        description: "",
      };
    }
    if (node.children) {
      for (const child of node.children) {
        collectComponents(child);
      }
    }
  }
  collectComponents(doc);

  return {
    fileKey: figma.fileKey ?? "plugin-local",
    name: pageName,
    lastModified: new Date().toISOString(),
    version: "plugin",
    document: doc,
    components,
    styles,
  };
}

// ---- Count nodes ----

function countNodes(node: { children?: readonly unknown[] }): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(
        child as { children?: readonly unknown[] }
      );
    }
  }
  return count;
}

// ---- Message handler ----

figma.ui.onmessage = async (msg: { type: string }) => {
  try {
  if (msg.type === "analyze-selection") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "error",
        message:
          "Nothing selected. Select a frame, component, or section to analyze.",
      });
      return;
    }

    // Use the first selected node (or a wrapper frame if multiple)
    const target = selection[0]!;
    const nodeCount = countNodes(target as unknown as { children?: readonly unknown[] });
    const file = await buildAnalysisFile(target, figma.currentPage.name);

    figma.ui.postMessage({
      type: "result",
      data: file,
      nodeCount,
      skipped: skippedNodes,
    });
  }

  if (msg.type === "focus-node") {
    const { nodeId } = msg as { type: string; nodeId: string };
    const node = figma.getNodeByIdAsync(nodeId).then((n) => {
      if (n && "absoluteBoundingBox" in n) {
        figma.viewport.scrollAndZoomIntoView([n as SceneNode]);
        figma.currentPage.selection = [n as SceneNode];
      }
    });
  }

  if (msg.type === "resize") {
    const { width, height } = msg as { type: string; width: number; height: number };
    figma.ui.resize(width, height);
  }
  } catch (error) {
    figma.ui.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
    });
  }
};

// Send anonymous device ID derived from Figma user ID
{
  const userId = figma.currentUser?.id ?? "unknown";
  // Simple FNV-1a hash to anonymize — no PII leaves the plugin
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const deviceId = "fp-" + (h >>> 0).toString(16).padStart(8, "0");
  figma.ui.postMessage({ type: "device-id", deviceId });
}

// Notify UI that plugin is ready
figma.ui.postMessage({ type: "ready" });
