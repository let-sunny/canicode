---
name: canicode-implement
description: Prepare a design-to-code implementation package from a Figma URL or fixture
---

# CanICode Implement -- Design-to-Code Package

Prepare everything an AI needs to implement a Figma design as code: analysis report, design tree with image assets, and a stack-specific prompt.

This skill does NOT auto-generate code. It assembles a package that you then feed to an AI coding assistant.

## Prerequisites

One of:
- **Figma MCP** (`https://mcp.figma.com/mcp`) for live Figma URLs without a token
- **FIGMA_TOKEN** environment variable for REST API access
- **Local fixture** directory (no token needed)

## Usage

### From a local fixture (simplest)

```bash
npx canicode implement ./fixtures/my-design --stack react-tailwind
```

### From a Figma URL

```bash
npx canicode implement "https://www.figma.com/design/ABC/File?node-id=1-234" --stack vue-css
```

### With Figma MCP (no token needed)

When the user provides a Figma URL and the official Figma MCP server is connected:

1. **Parse the URL** — extract `fileKey` and `nodeId`
2. **Save fixture first** using the Figma MCP flow from `/canicode` skill (Steps 1-3)
3. **Run implement** on the saved fixture:
   ```bash
   npx canicode implement fixtures/_mcp-temp --stack html-css
   ```
4. Clean up temp fixture if desired

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--stack <name>` | Target stack | `html-css` |
| `--output <dir>` | Output directory | `./canicode-implement/` |
| `--token <token>` | Figma API token | `FIGMA_TOKEN` env var |
| `--image-scale <n>` | Image export scale (1-4) | `2` (PC), use `3` for mobile |

### Available stacks

- `html-css` -- Standalone HTML + CSS (default, no build step)
- `react-tailwind` -- React + Tailwind CSS
- `react-css-modules` -- React + CSS Modules
- `vue-css` -- Vue 3 + scoped CSS

## Output Structure

```
canicode-implement/
  analysis.json      # Full analysis with issues and scores
  design-tree.txt    # DOM-like tree with styles, structure, embedded SVGs
  PROMPT.md          # Base prompt + stack-specific conventions
  screenshot.png     # Figma screenshot (if available)
  vectors/           # SVG assets for VECTOR nodes
  images/            # PNG assets for IMAGE fill nodes
```

## Next Steps

After running `canicode implement`:

1. Open `design-tree.txt` -- this is the primary input for the AI
2. Open `PROMPT.md` -- this contains the coding conventions
3. Feed both to your AI coding assistant along with any images from `images/` and `vectors/`
4. Review `analysis.json` for known design issues that may affect implementation
