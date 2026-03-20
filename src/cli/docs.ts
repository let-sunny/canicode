/**
 * Built-in documentation for aiready CLI
 */

export function printDocsIndex(): void {
  console.log(`
AIREADY DOCUMENTATION

  aiready docs rules    Custom rules guide + example
  aiready docs config   Config override guide + example
  aiready docs install  Installation guide (CLI, MCP, Skills)

Full documentation: github.com/let-sunny/aiready#readme
`.trimStart());
}

export function printDocsRules(): void {
  console.log(`
CUSTOM RULES GUIDE

Custom rules let you add project-specific checks beyond aiready's built-in 39 rules.

STRUCTURE
  - id: unique identifier (kebab-case)
  - category: layout | token | component | naming | ai-readability | handoff-risk
  - severity: blocking | risk | missing-info | suggestion
  - score: negative number (-1 to -15)
  - prompt: what Claude checks for (used in AI-based evaluation)
  - why: reason this matters
  - impact: consequence if ignored
  - fix: how to resolve

EXAMPLE
  [
    {
      "id": "icon-missing-component",
      "category": "component",
      "severity": "blocking",
      "score": -10,
      "prompt": "Check if this node is an icon (small size, vector children, no text) and is not a component or instance.",
      "why": "Icon nodes that are not components cannot be reused consistently.",
      "impact": "Developers will hardcode icons instead of using a shared component.",
      "fix": "Convert this icon node to a component and publish it to the library."
    }
  ]

USAGE
  aiready analyze <url> --custom-rules ./my-rules.json
  See full example: examples/custom-rules.json
`.trimStart());
}

export function printDocsConfig(): void {
  console.log(`
CONFIG GUIDE

Override aiready's default rule scores, severity, and filters.

STRUCTURE
  - excludeNodeTypes: node types to skip (e.g. VECTOR, BOOLEAN_OPERATION)
  - excludeNodeNames: name patterns to skip (e.g. icon, ico)
  - gridBase: spacing grid unit, default 8
  - colorTolerance: color diff tolerance, default 10
  - rules: per-rule overrides (score, severity, enabled)

EXAMPLE
  {
    "excludeNodeTypes": [],
    "excludeNodeNames": [],
    "gridBase": 4,
    "rules": {
      "no-auto-layout": { "score": -15, "severity": "blocking" },
      "raw-color": { "score": -12 },
      "default-name": { "enabled": false }
    }
  }

USAGE
  aiready analyze <url> --config ./my-config.json
  See full example: examples/config.json
`.trimStart());
}

export function printDocsInstall(): void {
  console.log(`
INSTALLATION GUIDE

CLI
  npm install -g aiready
  aiready analyze "https://www.figma.com/design/..."

MCP (Claude Code)
  claude mcp add --transport stdio aiready npx aiready-mcp
  Then in Claude Code: "Analyze this Figma file: <url>"

Skills (Claude Code)
  Copy .claude/skills/aiready/ from github.com/let-sunny/aiready
  Then in Claude Code: /aiready analyze <url>
`.trimStart());
}

const DOCS_TOPICS: Record<string, () => void> = {
  rules: printDocsRules,
  config: printDocsConfig,
  install: printDocsInstall,
};

export function handleDocs(topic?: string): void {
  if (!topic) {
    printDocsIndex();
    return;
  }

  const handler = DOCS_TOPICS[topic];
  if (handler) {
    handler();
  } else {
    console.error(`Unknown docs topic: ${topic}`);
    console.error(`Available topics: ${Object.keys(DOCS_TOPICS).join(", ")}`);
    process.exit(1);
  }
}
