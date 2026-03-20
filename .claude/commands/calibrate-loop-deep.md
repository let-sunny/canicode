Run a deep calibration debate loop using Figma MCP for precise design context.

Input: $ARGUMENTS (Figma URL with node-id, e.g. `https://www.figma.com/design/ABC123/MyDesign?node-id=1-234`)

## Instructions

You are the orchestrator. Do NOT make calibration decisions yourself. Only pass data between agents and run deterministic CLI steps.

### Step 1 — Runner (Analysis via MCP)

Run this command directly:

```
pnpm exec drc calibrate-analyze "$ARGUMENTS" --output logs/calibration/calibration-analysis.json
```

Read `logs/calibration/calibration-analysis.json`. If `issueCount` is 0, stop here: "No issues found."

### Step 2 — Converter (Code Conversion via Figma MCP)

Spawn the `calibration-converter` subagent with this prompt:

> Convert the top 5 nodes from this analysis to code:
> - Analysis JSON: logs/calibration/calibration-analysis.json
> - Original input: $ARGUMENTS
> - Output to: logs/calibration/calibration-conversion.json
>
> This is a Figma URL. Use `get_design_context` MCP tool with fileKey and nodeId for each node.

Wait for the Converter to complete.

### Step 3 — Evaluation (CLI)

Run this command directly:

```
pnpm exec drc calibrate-evaluate logs/calibration/calibration-analysis.json logs/calibration/calibration-conversion.json
```

Read the generated report from `logs/calibration/` (the most recent `.md` file).
Extract the proposals (score adjustments and new rule proposals).

If there are zero proposals, stop here and report: "No calibration adjustments needed."

### Step 4 — Critic

Spawn the `calibration-critic` subagent with this prompt:

> Review these calibration proposals:
> (paste the proposals section only — NOT any reasoning chain)

Wait for the Critic to complete. Capture its full critique (APPROVE/REJECT/REVISE per rule).

### Step 5 — Arbitrator

Spawn the `calibration-arbitrator` subagent with this prompt:

> Here are the Runner proposals and Critic reviews. Make final decisions.
>
> Runner proposals:
> (paste the proposals from Step 3)
>
> Critic reviews:
> (paste the Critic's reviews from Step 4)
>
> Fixture: $ARGUMENTS

Wait for the Arbitrator to complete.

### Done

Report the final summary from the Arbitrator.

## Rules

- Each agent must be a SEPARATE subagent call (isolated context).
- Pass only structured data between agents — never raw reasoning.
- The Critic must NOT see the Runner's or Converter's reasoning, only the proposal list.
- Only the Arbitrator may edit `rule-config.ts`.
- Steps 1 and 3 are CLI commands — run them directly with Bash, NOT as subagents.
