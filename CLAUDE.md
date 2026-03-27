# CanICode

A CLI tool that analyzes Figma design structures to provide development-friendliness and AI-friendliness scores and reports.

## Core Goal

**Help teams implement Figma designs exactly as designed, with zero unnecessary AI token cost.**

The design-tree format converts Figma data into a curated, CSS-ready representation that AI can implement directly. Early ablation experiments suggest design-tree produces higher pixel accuracy with significantly fewer tokens than raw Figma JSON. The key insight: **information curation > information abundance** — AI works better with focused, noise-free input.

See [Experiment Wiki](https://github.com/let-sunny/canicode/wiki) for detailed data and methodology.

## Target Environment

The primary target is **teams with designers** where developers (+AI) implement large Figma pages:
- **Page scale**: 300+ nodes, full screens, not small component sections
- **Component-heavy**: Design systems with reusable components, variants, tokens
- **AI context budget**: Large pages must fit in AI context windows — componentization reduces token count via deduplication
- **Not the target**: Individual developers generating simple UI with AI — they don't need Figma analysis

This means:
- Component-related rule scores (missing-component, etc.) should NOT be lowered based on small fixture calibration
- Token consumption is a first-class metric — designs that waste tokens on repeated structures are penalized
- Calibration fixtures must be large-scale (270+ nodes) — experiments showed small fixtures (50-100 nodes) produce misleading results
- `no-auto-layout` is the single highest-impact rule (score -10) — empirically validated via ablation experiments

## Tech Stack

- **Runtime**: Node.js (>=18)
- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm
- **Validation**: zod
- **Testing**: vitest
- **CLI**: cac
- **Build**: tsup

## Project Structure

```
src/                          # Node.js runtime (tsup build)
├── core/                     # Shared analysis engine
│   ├── engine/               # rule-engine, scoring, loader, config-store
│   ├── rules/                # Rule definitions + config
│   ├── contracts/            # Type definitions + Zod schemas
│   ├── adapters/             # Figma API integrations
│   ├── report-html/          # HTML report generation
│   └── monitoring/           # Telemetry
├── cli/                      # Entrypoint: CLI
├── mcp/                      # Entrypoint: MCP server
└── agents/                   # Internal: Calibration pipeline

app/                          # Browser runtime
├── shared/                   # Common UI (gauge, issue list, styles, constants)
├── web/                      # Entrypoint: Web App (GitHub Pages)
│   ├── src/                  # Source
│   └── dist/                 # Build output (deployed)
├── figma-plugin/             # Entrypoint: Figma Plugin
│   ├── src/                  # Source
│   └── dist/                 # Build output (gitignored)

.claude/skills/canicode/      # Entrypoint: Claude Code skill
```

## Architecture

### External (5 User-Facing Channels)

**1. CLI (`canicode analyze`)**
- Data source: Figma REST API (requires FIGMA_TOKEN) or JSON fixture
- Output: HTML report (opens in browser)
- Options: `--preset`, `--token`, `--output`, `--config`
- Also: `canicode save-fixture` to save Figma data as JSON for offline analysis
- Also: `canicode implement` to prepare a design-to-code package (analysis + design tree + assets + prompt)
- Component master resolution: fetches `componentDefinitions` for accurate component analysis
- Annotations: NOT available (REST API annotations field is private beta)

**2. MCP Server (`canicode-mcp`)**
- Install: `claude mcp add canicode -- npx -y -p canicode canicode-mcp`
- Tools: `analyze`, `list-rules`, `visual-compare`, `version`, `docs`
- Data source: Figma REST API via `input` param (Figma URL or fixture path). Requires FIGMA_TOKEN for live URLs.
- Note: Figma MCP (`get_metadata`/`get_design_context`) is NOT supported as analysis input — it returns collapsed node trees that produce inaccurate results.

**3. Claude Code Skill (`/canicode`)**
- Location: `.claude/skills/canicode/SKILL.md` (copy to any project)
- Uses CLI (`canicode analyze`) with FIGMA_TOKEN
- Lightweight alternative to MCP server — no canicode MCP installation needed

**4. Web App (GitHub Pages)**
- Source: `app/web/src/index.html`
- Build: `pnpm build:web` → `app/web/dist/` (deployed via GitHub Pages)
- Shared UI from `app/shared/` inlined at build time

**5. Figma Plugin**
- Source: `app/figma-plugin/src/`
- Build: `pnpm build:plugin` → `app/figma-plugin/dist/` (gitignored)
- Shared UI from `app/shared/` inlined at build time

### Internal (Claude Code Only)

Calibration commands are NOT exposed as CLI commands. They run exclusively inside Claude Code via subagents.

**`/calibrate-loop` (Claude Code command)**
- Role: Autonomous rule-config.ts improvement via fixture-based calibration
- Input: fixture directory path (e.g. `fixtures/material3-kit`)
- Flow: Analysis → Converter (entire design → HTML + visual-compare) → Gap Analyzer → Evaluation → Critic → Arbitrator → Prune Evidence
- Converter implements the full scoped design as one HTML page, runs `visual-compare` for pixel-level similarity
- Gap Analyzer examines the diff image, categorizes pixel differences, saves to run directory
- Cross-run evidence: Evaluation appends overscored/underscored findings to `data/calibration-evidence.json`; Gap Analyzer appends uncovered gaps to `data/discovery-evidence.json` (environment/tooling noise is auto-filtered)
- After Arbitrator applies changes, evidence for applied rules is pruned (`calibrate-prune-evidence`)
- Each run creates a self-contained directory: `logs/calibration/<fixture>--<timestamp>/`
- No Figma MCP or API keys needed — works fully offline
- Auto-commits agreed score changes

**`/calibrate-night` (Claude Code command)**
- Role: Run calibration on multiple fixtures sequentially, then generate aggregate report
- Input: fixture directory path (e.g. `fixtures/my-designs`) — auto-discovers active fixtures
- Flow: `fixture-list` → sequential `/calibrate-loop` per fixture → `fixture-done` (converged) → `calibrate-gap-report` → `logs/calibration/REPORT.md`

**`/add-rule` (Claude Code command)**
- Role: Research, design, implement, and evaluate new analysis rules
- Input: concept + fixture path (e.g. `"component description" fixtures/material3-kit`)
- Flow: Researcher → Designer → Implementer → A/B Visual Validation → Evaluator → Critic
- Researcher reads accumulated discovery evidence from `data/discovery-evidence.json` to find recurring patterns
- After KEEP/ADJUST, discovery evidence for the rule's category is pruned (`discovery-prune-evidence`)
- Each run creates a directory: `logs/rule-discovery/<concept>--<date>/`
- A/B Validation: implements entire design with/without the rule's data, compares similarity
- Critic decides KEEP / ADJUST / DROP

### File Output Structure

```
data/calibration-evidence.json              # Cross-run calibration evidence (overscored/underscored rules)
data/discovery-evidence.json                # Cross-run discovery evidence (uncovered gaps for /add-rule)
reports/                                    # HTML reports (canicode analyze)
logs/calibration/                           # Calibration runs (internal)
logs/calibration/<name>--<timestamp>/       # One calibration run = one folder
  ├── analysis.json                         #   Rule analysis result
  ├── conversion.json                       #   HTML conversion + similarity
  ├── gaps.json                             #   Pixel gap analysis
  ├── debate.json                           #   Critic + Arbitrator decisions
  ├── activity.jsonl                        #   Agent step-by-step timeline
  ├── summary.md                            #   Human-readable summary
  ├── output.html                           #   Generated HTML page
  ├── design-tree.txt                       #   Design tree (structure)
  ├── figma.png                             #   Figma screenshot
  ├── code.png                              #   Code rendering screenshot
  └── diff.png                              #   Pixel diff image
logs/calibration/REPORT.md                  # Cross-run aggregate report
logs/rule-discovery/                        # Rule discovery runs (internal)
logs/rule-discovery/<concept>--<date>/      # One rule discovery = one folder
logs/activity/                              # Nightly orchestration logs
```

## Design Tree Format

The design-tree is canicode's core output — a combined DOM + Style tree that merges Figma structure and styling into a single, CSS-ready representation. Generated by `generateDesignTree()` in `design-tree.ts`.

```text
Hero Section (FRAME, 375x960)              ← name (TYPE, WxH)
  style: display: flex; gap: 32px          ← CSS properties (converted from Figma)
  [component: Platform=Mobile, Size=Large] ← component with variant properties
  Title (TEXT, 300x48)                     ← child node (indentation = hierarchy)
    style: font-size: 48px; color: #2C2C2C ← inline CSS
```

### Node annotations

- `(TYPE, WxH)` — Figma node type + dimensions
- `style:` — CSS properties converted from Figma (layoutMode→flex, fills→color, etc.)
- `[component: ComponentName]` — component instance annotation (outputs `comp.name`; variant components naturally have `Key=Value` names like `Platform=Mobile, State=Default`)
- `[IMAGE]` — image placeholder (actual images in `images/` directory)
- `svg:` — inline SVG for vector nodes
- `SLOT` type — replaceable area in component

### Key design decisions

- **DOM + Style combined** — AI implements each node without cross-referencing separate files
- **CSS-ready values** — Figma properties pre-converted (no r/g/b math, no layoutMode lookup)
- **Noise removed** — no exportSettings, pluginData, internal IDs
- **Responsive-friendly** — flex/layout properties pre-converted; `width: 100%` emitted when sizing mode is `FILL`

### Conversion examples

| Figma | design-tree |
|---|---|
| `layoutMode: "VERTICAL"` | `display: flex; flex-direction: column` |
| `fills: [{color: {r:0.12,g:0.12,b:0.12,a:0.5}}]` | `rgba(30, 30, 30, 0.5)` |
| `layoutSizingHorizontal: "FILL"` | `width: 100%` |
| `imageRef: "abc123"` | `[IMAGE]` |

## Analysis Scope Policy

- Analysis unit: section or page level (`node-id` required in URL)
- Full-file analysis is discouraged — too many nodes, noisy results
- If no `node-id` is provided, CLI prints a warning
- Recommended scope: one screen or a related component group

## Dev Commands

```bash
pnpm build          # Production build
pnpm dev            # Development mode (watch)
pnpm test           # Run tests (watch)
pnpm test:run       # Run tests (single run)
pnpm lint           # Type check
```

## Deployment

npm publishing is handled by GitHub CI — **do not run `npm publish` manually**.

1. Update version in `package.json`
2. Merge the approved PR to main (do not bypass the PR workflow)
3. Tag the merged commit on main: `git tag v0.x.x && git push origin v0.x.x`
4. GitHub Actions CI automatically publishes to npm on tag push

## Conventions

### Language

- All code, comments, and documentation must be written in English
- This is a global project targeting international users

### Code Style

- Use ESM modules (`import`/`export`)
- Use `.js` extension for relative imports
- Use relative paths for imports (not `@/*` alias)

### TypeScript

- strict mode enabled
- `noUncheckedIndexedAccess` enabled - must check for undefined when accessing arrays/objects
- `exactOptionalPropertyTypes` enabled - no explicit undefined assignment to optional properties

### Zod

- Validate all external inputs with Zod schemas
- Schema definitions go in `contracts/` directory
- Infer TypeScript types from schemas: `z.infer<typeof Schema>`

### Testing

- Test files are co-located with source files as `*.test.ts`
- describe/it/expect are globally available (vitest globals)

### Naming

- Files: kebab-case (`my-component.ts`)
- Types/Interfaces: PascalCase (`MyInterface`)
- Functions/Variables: camelCase (`myFunction`)
- Constants: SCREAMING_SNAKE_CASE (`MY_CONSTANT`)

### Git

- Commit messages: conventional commits (feat, fix, docs, refactor, test, chore)

### PR Workflow

1. Always create PRs as **draft** first — wait for user approval before marking ready
2. When changes are needed, convert back to **draft** — mark ready again when done
3. After creating a PR, **subscribe** with `subscribe_pr_activity` to monitor reviews and CI in real-time
4. After each push, watch for CodeRabbit's first comment — if it contains a rate limit message, wait the specified duration then push an empty commit (`git commit --allow-empty -m "chore: re-trigger review"`) to re-trigger
5. Address review comments immediately as they arrive
6. Never merge without **explicit user approval** — always use squash merge and delete the branch after

## Severity Levels

Rules are classified into 4 severity levels:

- **blocking**: Cannot implement correctly without fixing. Direct impact on screen reproduction.
- **risk**: Implementable now but will break or increase cost later.
- **missing-info**: Information is absent, forcing developers to guess.
- **suggestion**: Not immediately problematic, but improves systemization.

## Score Calibration

Rule scores started as intuition-based estimates. The calibration pipeline validates them against actual code conversion difficulty measured by pixel-level visual comparison.

Process:
1. Run analysis on real Figma files (`canicode calibrate-analyze`)
2. Implement the entire scoped design as one HTML page (`Converter`)
3. Run `canicode visual-compare` — pixel-level comparison against Figma screenshot
4. Analyze the diff image to categorize pixel gaps (`Gap Analyzer`)
5. Compare conversion difficulty vs rule scores (`canicode calibrate-evaluate`)
6. 6-agent debate loop (`/calibrate-loop`): Analysis → Converter → Gap Analyzer → Evaluation → Critic → Arbitrator

**Cross-run evidence** accumulates across sessions in `data/`:
- `calibration-evidence.json` — overscored/underscored rules (fed to Runner for stronger proposals)
- `discovery-evidence.json` — uncovered gaps not covered by existing rules (fed to `/add-rule` Researcher)
- Discovery evidence is filtered to exclude environment/tooling noise (font CDN, retina/DPI, network, CI constraints)
- Evidence is pruned after rules are applied (calibration) or new rules are created (discovery)

Final score adjustments in `rule-config.ts` are always reviewed by the developer via the Arbitrator's decisions.

## Adjustable Rule Config

All rule scores, severity, and thresholds are managed in `rules/rule-config.ts`.
Rule logic and score config are intentionally separated so scores can be tuned without touching rule logic.

Configurable thresholds:
- `gridBase` (default: 4) — spacing grid unit for inconsistent-spacing and magic-number-spacing
- `tolerance` (default: 10) — color difference tolerance for multiple-fill-colors