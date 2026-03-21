---
name: canicode
description: Analyze Figma designs for development-friendliness and AI-friendliness scores
---

# CanICode -- Figma Design Analysis

Analyze Figma design files to score how development-friendly and AI-friendly they are. Produces actionable reports with specific issues and fix suggestions.

## Prerequisites: Official Figma MCP Server

This skill requires the **official Figma MCP server** (`https://mcp.figma.com/mcp`) to be connected.

**Before doing anything else**, check if `mcp__figma__get_metadata` is available in this session:
- If available → proceed with analysis
- If NOT available → stop and show the user this setup guide:

```
The official Figma MCP server is required but not connected.

Set it up at the project level:

  claude mcp add -s project -t http figma https://mcp.figma.com/mcp

This creates a .mcp.json file in your project root.
After adding, restart the Claude Code session to activate the connection.

Note: The first time you connect, Figma OAuth will prompt you to authorize in the browser.
```

Do NOT proceed with analysis if Figma MCP is not available. Do NOT fall back to CLI `--mcp` mode.

## How to Analyze a Figma URL

When the user provides a Figma URL, follow these steps:

### Step 1: Parse the URL
Extract `fileKey` and `nodeId` from the URL:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → convert `-` to `:` in nodeId

### Step 2: Fetch design metadata via Figma MCP
Call `mcp__figma__get_metadata` directly from this session:
```
fileKey: (extracted from URL)
nodeId: (extracted from URL, use ":" separator e.g. "127:2")
```

### Step 3: Convert XML to fixture JSON and analyze
1. Parse the XML response from `mcp__figma__get_metadata`
2. Convert to AnalysisFile JSON format:
```json
{
  "fileKey": "<fileKey>",
  "name": "<fileName>",
  "lastModified": "<current ISO date>",
  "version": "mcp",
  "document": {
    // Convert XML nodes to AnalysisNode format:
    // <frame id="1:2" name="MyFrame" x="0" y="0" width="100" height="50">
    // becomes:
    // { "id": "1:2", "name": "MyFrame", "type": "FRAME", "visible": true,
    //   "absoluteBoundingBox": { "x": 0, "y": 0, "width": 100, "height": 50 } }
    //
    // XML tag → type mapping:
    //   frame → FRAME, group → GROUP, section → SECTION,
    //   component → COMPONENT, component-set → COMPONENT_SET,
    //   instance → INSTANCE, rectangle → RECTANGLE,
    //   text → TEXT, vector → VECTOR, ellipse → ELLIPSE,
    //   line → LINE, boolean-operation → BOOLEAN_OPERATION
    //
    // hidden="true" → visible: false
  },
  "components": {},
  "styles": {}
}
```
3. Save to `fixtures/_mcp-temp.json`
4. Run: `npx canicode analyze fixtures/_mcp-temp.json [options]`
5. Clean up: delete `fixtures/_mcp-temp.json` after analysis

**IMPORTANT:** Do NOT use `npx canicode analyze <url> --mcp`. The `--mcp` CLI flag has been removed.

## Analyzing a JSON fixture (no MCP needed)

```bash
npx canicode analyze fixtures/my-design.json
```

## Analysis Options

### Presets
- `--preset relaxed` -- Downgrades blocking to risk, reduces scores by 50%
- `--preset dev-friendly` -- Focuses on layout and handoff rules only
- `--preset ai-ready` -- Boosts structure and naming rule weights by 150%
- `--preset strict` -- Enables all rules, increases all scores by 150%

### Custom rules
```bash
npx canicode analyze <input> --custom-rules ./my-rules.json
```

### Config overrides
```bash
npx canicode analyze <input> --config ./my-config.json
```

## What It Reports

39 rules across 6 categories: Layout, Design Token, Component, Naming, AI Readability, Handoff Risk.

Each issue includes:
- Rule ID and severity (blocking / risk / missing-info / suggestion)
- Affected node with Figma deep link
- Why it matters, impact, and how to fix
