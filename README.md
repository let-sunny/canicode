# Design Readiness Checker

A CLI tool that analyzes Figma design files and scores how development-friendly and AI-friendly they are.

## Problem

Designers hand off Figma files. Developers open them and immediately start guessing — is this auto-layout or absolute? Are these colors from a token system or hardcoded hex values? Will this layout break on different screen sizes?

These questions slow down implementation, produce inconsistent code, and make AI-assisted code generation unreliable. The gap between "looks right in Figma" and "actually implementable" is real, but invisible until someone tries to write the code.

Design Readiness Checker makes that gap measurable. It scans a Figma file's structure and produces a concrete score with specific, actionable issues — before any code is written.

## How It Works

### 39 Rules, 4 Severity Levels

Every node in the Figma tree is checked against 39 rules across 6 categories:

| Category | Rules | What it checks |
|----------|-------|----------------|
| Layout | 11 | Auto-layout usage, responsive behavior, nesting depth |
| Design Token | 7 | Color/font/shadow tokenization, spacing consistency |
| Component | 6 | Component reuse, detached instances, variant coverage |
| Naming | 5 | Semantic names, default names, naming conventions |
| AI Readability | 5 | Structure clarity, z-index reliance, empty frames |
| Handoff Risk | 5 | Hardcoded values, truncation handling, placeholder images |

Each issue is classified by severity:

- **Blocking** — Cannot implement correctly without fixing. Direct impact on screen reproduction.
- **Risk** — Implementable now, but will break or increase cost later.
- **Missing Info** — Information is absent, forcing developers to guess.
- **Suggestion** — Not immediately problematic, but improves systemization.

### Density-Based Scoring

The score is not a simple issue count. It uses a density + diversity algorithm:

```
Final Score = (Density Score × 0.7) + (Diversity Score × 0.3)

Density Score  = 100 - (weighted issue count / node count) × 100
Diversity Score = (1 - unique violated rules / total rules in category) × 100
```

Severity weights issues — a single blocking issue counts 3× more than a suggestion. Scores are calculated per category and combined into an overall grade (A/B/C/D/F).

### Scoped Analysis

Pass a Figma URL with a `node-id` parameter to analyze a specific frame or component instead of the entire file. Useful for focusing on a single screen or section.

## Installation

```bash
# Clone and install
git clone <repo-url>
cd design-readiness-checker
pnpm install

# Build
pnpm build
```

Requires Node.js >= 18 and pnpm.

## Usage

### Analyze a Figma file

```bash
# From a Figma URL (requires FIGMA_TOKEN env var or --token flag)
drc analyze https://www.figma.com/design/ABC123/MyDesign

# From a JSON fixture
drc analyze ./fixtures/design.json

# With a preset and HTML report output
drc analyze https://www.figma.com/design/ABC123/MyDesign --preset strict --output report.html
```

### Presets

| Preset | Behavior |
|--------|----------|
| `relaxed` | Downgrades blocking to risk, reduces scores by 50% |
| `dev-friendly` | Focuses on layout and handoff rules only |
| `ai-ready` | Boosts structure and naming rule weights by 150% |
| `strict` | Enables all rules, increases all scores by 150% |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIGMA_TOKEN` | For Figma URLs | Figma personal access token |
| `ANTHROPIC_API_KEY` | For `--deep-compare` | Anthropic API key for Claude Vision comparison |

## Calibration Agent

Rule scores are initially intuition-based. The calibration pipeline validates and adjusts them by comparing analysis results against actual code conversion difficulty.

### How calibration works

1. **Analysis Agent** — Runs the standard analysis and groups issues by node
2. **Conversion Agent** — Attempts to convert flagged nodes to code (via LLM + Figma MCP)
3. **Evaluation Agent** — Compares predicted difficulty (from rule scores) against actual conversion difficulty
4. **Tuning Agent** — Proposes score adjustments with confidence levels

If a rule flagged something as blocking but the conversion was easy, the rule is **overscored**. If conversion was hard but the rule gave a low score, it's **underscored**. Missing difficulties with no rule coverage become **new rule proposals**.

### 3-step CLI workflow

Step 2 (conversion) requires a Claude Code session with Figma MCP access, so the pipeline is split:

```bash
# Step 1: Analyze and output JSON
drc calibrate-analyze ./fixtures/design.json

# Step 2: Convert nodes in Claude Code session with Figma MCP
# (produces calibration-conversion.json)

# Step 3: Evaluate and generate report
drc calibrate-evaluate calibration-analysis.json calibration-conversion.json
```

The output is `CALIBRATION_REPORT.md` — a human-reviewed report with proposed score changes. Final edits to `rule-config.ts` are always manual.

### Visual comparison

When conversion data includes screenshots, pixelmatch-based visual comparison is available:

```bash
# Enable visual comparison (deterministic pixel diff, no cost)
drc calibrate-evaluate analysis.json conversion.json --visual

# Add Claude Vision analysis (requires ANTHROPIC_API_KEY)
drc calibrate-evaluate analysis.json conversion.json --visual --deep-compare
```

## Tech Stack

| Layer | Tool |
|-------|------|
| Runtime | Node.js (>= 18) |
| Language | TypeScript (strict mode) |
| Package Manager | pnpm |
| Validation | Zod |
| Testing | Vitest |
| CLI | cac |
| Build | tsup |
| Visual Diff | pixelmatch + pngjs |

## Roadmap

### Phase 1 — Core Analysis (done)

39 rules, density-based scoring, HTML reports, Figma API integration, presets, scoped analysis.

### Phase 2 — Calibration Pipeline (done)

4-agent calibration system, 3-step CLI workflow, markdown calibration reports, visual comparison with pixelmatch, optional Claude Vision deep compare, activity logging.

### Phase 3 — Automated Calibration

Multi-agent architecture for fully automated calibration runs. Orchestrator coordinates analysis, conversion (via Figma MCP), evaluation, and tuning agents without manual intervention. CI integration for periodic score validation.

### Phase 4 — Ecosystem

Plugin system for custom rules. Figma plugin for in-editor feedback. Integration with design system documentation tools. Public rule score dataset from community calibration runs.

## License

MIT
