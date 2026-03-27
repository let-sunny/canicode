import type { AnalysisFile, AnalysisNode, AnalysisNodeType } from "../contracts/figma-node.js";
import { parseDesignContextCode, parseCodeHeader, enrichNodeWithStyles } from "./tailwind-parser.js";

/**
 * Map MCP XML tag names to Figma AnalysisNodeType.
 *
 * Note: `symbol` and `instance` tags are typically self-closing in get_metadata
 * output (e.g., `<symbol ... />`, `<instance ... />`), meaning their internal
 * children are not available through the MCP path.
 */
const TAG_TYPE_MAP: Record<string, AnalysisNodeType> = {
  canvas: "CANVAS",
  frame: "FRAME",
  group: "GROUP",
  section: "SECTION",
  component: "COMPONENT",
  "component-set": "COMPONENT_SET",
  instance: "INSTANCE",
  rectangle: "RECTANGLE",
  "rounded-rectangle": "RECTANGLE",
  ellipse: "ELLIPSE",
  vector: "VECTOR",
  text: "TEXT",
  line: "LINE",
  "boolean-operation": "BOOLEAN_OPERATION",
  star: "STAR",
  "regular-polygon": "REGULAR_POLYGON",
  slice: "SLICE",
  sticky: "STICKY",
  table: "TABLE",
  "table-cell": "TABLE_CELL",
  symbol: "COMPONENT",
  slot: "FRAME",
};

interface ParsedXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: ParsedXmlNode[];
}

/**
 * Minimal XML parser for MCP metadata output.
 * Handles self-closing tags and nested elements.
 */
function parseXml(xml: string): ParsedXmlNode[] {
  const nodes: ParsedXmlNode[] = [];
  const stack: ParsedXmlNode[] = [];
  // Match opening tags (with attrs), closing tags, and self-closing tags
  const tagRegex = /<(\/?)([\w-]+)([^>]*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2]!;
    const attrString = match[3] ?? "";
    const isSelfClosing = match[4] === "/";

    if (isClosing) {
      // Pop from stack
      const finished = stack.pop();
      if (finished) {
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children.push(finished);
        } else {
          nodes.push(finished);
        }
      }
    } else {
      const attrs = parseAttributes(attrString);
      const node: ParsedXmlNode = { tag: tagName, attrs, children: [] };

      if (isSelfClosing) {
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children.push(node);
        } else {
          nodes.push(node);
        }
      } else {
        stack.push(node);
      }
    }
  }

  // Flush remaining stack
  while (stack.length > 0) {
    const finished = stack.pop()!;
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(finished);
    } else {
      nodes.push(finished);
    }
  }

  return nodes;
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) {
      attrs[key] = value;
    }
  }
  return attrs;
}

/**
 * Convert a parsed XML node to an AnalysisNode.
 *
 * Note: Self-closing XML tags (e.g., `<instance ... />` or `<symbol ... />`)
 * will produce AnalysisNodes with no children. This is expected — MCP
 * get_metadata collapses component/instance internals. These leaf nodes still
 * carry position, size, and name data useful for structure-level rules.
 */
function toAnalysisNode(xmlNode: ParsedXmlNode): AnalysisNode {
  const type = TAG_TYPE_MAP[xmlNode.tag] ?? "FRAME";
  const id = xmlNode.attrs["id"] ?? "0:0";
  const name = xmlNode.attrs["name"] ?? xmlNode.tag;
  const hidden = xmlNode.attrs["hidden"] === "true";

  const x = parseFloat(xmlNode.attrs["x"] ?? "0");
  const y = parseFloat(xmlNode.attrs["y"] ?? "0");
  const width = parseFloat(xmlNode.attrs["width"] ?? "0");
  const height = parseFloat(xmlNode.attrs["height"] ?? "0");

  const node: AnalysisNode = {
    id,
    name,
    type,
    visible: !hidden,
    absoluteBoundingBox: { x, y, width, height },
  };

  if (xmlNode.children.length > 0) {
    node.children = xmlNode.children.map(toAnalysisNode);
  }

  return node;
}

/**
 * Parse MCP get_metadata XML output into an AnalysisFile.
 *
 * The XML represents a subtree of the Figma file. We wrap it in a
 * DOCUMENT node and fill in minimal file metadata.
 *
 * **Known limitations (as of 2026-03):**
 * - `get_metadata` returns collapsed (self-closing) `<symbol ... />` for COMPONENT
 *   nodes and `<instance ... />` for some INSTANCE nodes. Internal children are NOT
 *   expanded, so component/instance subtree analysis is incomplete compared to the
 *   CLI/REST API path which provides full `componentDefinitions`.
 * - This parser still produces valid AnalysisFile output for rule analysis (layout,
 *   spacing, naming, etc.), but rules that depend on instance internals or component
 *   master trees (e.g., style-override detection, missing-component) will have
 *   reduced accuracy.
 * - MCP-generated code (via get_design_context) embeds hardcoded widths in child
 *   elements, making responsive behavior dependent on LLM post-processing to strip
 *   fixed widths. The CLI/design-tree path is inherently responsive (only root width
 *   needs removal).
 */
export function parseMcpMetadataXml(
  xml: string,
  fileKey: string,
  fileName?: string
): AnalysisFile {
  const parsed = parseXml(xml);

  // The root XML elements become children of the document
  const children = parsed.map(toAnalysisNode);

  // If there's exactly one root element, use it directly as the document root
  // Otherwise wrap in a DOCUMENT node
  let document: AnalysisNode;
  if (children.length === 1 && children[0]) {
    document = children[0];
  } else {
    document = {
      id: "0:0",
      name: "Document",
      type: "DOCUMENT",
      visible: true,
      children,
    };
  }

  return {
    fileKey,
    name: fileName ?? fileKey,
    lastModified: new Date().toISOString(),
    version: "mcp",
    document,
    components: {},
    styles: {},
  };
}

/**
 * Enrich an AnalysisFile (from get_metadata) with style data extracted
 * from get_design_context code output.
 *
 * The design context code is React+Tailwind generated for a specific node.
 * We parse Tailwind classes to extract layout, color, spacing, and effect
 * properties, then merge them into matching AnalysisNodes in the tree.
 *
 * **Known limitations:**
 * - Since get_metadata collapses instance/component internals, enrichment can
 *   only apply styles to nodes that exist in the metadata tree. Child nodes
 *   inside collapsed instances are never enriched.
 * - The enrichChildrenFromCode heuristic matches children by name comments in
 *   the generated code, which is fragile and only works for direct children
 *   that Figma MCP chose to annotate with comments.
 * - Despite these limitations, this function provides meaningful style data
 *   for structure-level analysis (layout, spacing, colors) and is still used
 *   by the MCP analysis path.
 *
 * @param file - AnalysisFile from parseMcpMetadataXml
 * @param designContextCode - Code string from get_design_context
 * @param targetNodeId - The node ID that get_design_context was called for (optional)
 */
export function enrichWithDesignContext(
  file: AnalysisFile,
  designContextCode: string,
  targetNodeId?: string,
): void {
  const header = parseCodeHeader(designContextCode);
  const styles = parseDesignContextCode(designContextCode);

  // If header provides auto-layout info, use it
  if (header.hasAutoLayout === true && header.layoutDirection) {
    if (!styles.layoutMode) styles.layoutMode = header.layoutDirection;
  } else if (header.hasAutoLayout === false) {
    // Explicitly no auto-layout — don't set layoutMode
    delete styles.layoutMode;
  }

  // Find the target node and enrich it
  if (targetNodeId) {
    const node = findNodeById(file.document, targetNodeId);
    if (node) {
      enrichNodeWithStyles(node, styles);
      enrichChildrenFromCode(node, designContextCode);
      return;
    }
  }

  // Fallback: enrich the root document node
  enrichNodeWithStyles(file.document, styles);
  enrichChildrenFromCode(file.document, designContextCode);
}

/**
 * Try to enrich child nodes by scanning the full code for className patterns.
 * For each child, extract classes from JSX elements that match the child's name.
 */
function enrichChildrenFromCode(parent: AnalysisNode, code: string): void {
  if (!parent.children) return;

  for (const child of parent.children) {
    // Look for comments like "{/* ChildName */}" or "{/* ChildName — ... */}"
    const escapedName = child.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const commentPattern = new RegExp(
      `\\{/\\*\\s*${escapedName}(?:\\s*—[^*]*)?\\s*\\*/\\}\\s*\\n\\s*<\\w+[^>]*className="([^"]*)"`,
    );
    const match = code.match(commentPattern);
    if (match?.[1]) {
      const childStyles = parseDesignContextCode(
        `<div className="${match[1]}">`,
      );
      enrichNodeWithStyles(child, childStyles);
    }

    // Recurse into children
    if (child.children) {
      enrichChildrenFromCode(child, code);
    }
  }
}

function findNodeById(node: AnalysisNode, id: string): AnalysisNode | undefined {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return undefined;
}
