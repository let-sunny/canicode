Run a calibration debate loop using local fixture JSON files. No Figma MCP needed.

Input: $ARGUMENTS (fixture path, e.g. `fixtures/material3-kit.json`)

## Instructions

You are the orchestrator. Do NOT make calibration decisions yourself. Only pass data between agents and run deterministic CLI steps.

### Step 0 — Setup

Generate the activity log filename for this run. Extract the fixture name from the input path (e.g. `fixtures/material3-kit.json` → `material3-kit`). Create the log file:

```
logs/activity/YYYY-MM-DD-HH-mm-<fixture-name>.md
```

Example: `logs/activity/2026-03-20-22-30-material3-kit.md`

Write the header to the log file:
```
# Calibration Activity Log — YYYY-MM-DD-HH-mm-<fixture-name>
```

Use this exact log file path in ALL subsequent subagent prompts.

### Step 1 — Analysis (CLI)

Run this command directly:

```
npx drc calibrate-analyze $ARGUMENTS --output logs/calibration/calibration-analysis.json
```

Read `logs/calibration/calibration-analysis.json`. If `issueCount` is 0, stop here: "No issues found."

### Step 2 — Converter (Code Conversion from fixture JSON)

Spawn the `calibration-converter` subagent (use `general-purpose` type) with this prompt:

> Convert the top 5 nodes from this analysis to code:
> - Analysis JSON: logs/calibration/calibration-analysis.json
> - Original input: $ARGUMENTS
> - Output to: logs/calibration/calibration-conversion.json
> - Activity log: <LOG_FILE_PATH>
>
> This is a fixture file. Read the fixture JSON directly to get node data. Do NOT call Figma MCP.
>
> (include full converter instructions from .claude/agents/calibration-converter.md)

Wait for the Converter to complete.

### Step 3 — Evaluation (CLI)

Run this command directly:

```
npx drc calibrate-evaluate logs/calibration/calibration-analysis.json logs/calibration/calibration-conversion.json
```

Read the generated report from `logs/calibration/` (the most recent `.md` file).
Extract the proposals (score adjustments and new rule proposals).

If there are zero proposals, stop here and report: "No calibration adjustments needed."

### Step 4 — Critic

Spawn the `calibration-critic` subagent with this prompt:

> Review these calibration proposals:
> (paste the proposals section only — NOT any reasoning chain)
>
> Append your critique to: <LOG_FILE_PATH>

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
> Activity log: <LOG_FILE_PATH>

Wait for the Arbitrator to complete.

### Done

Report the final summary from the Arbitrator.

## Rules

- Each agent must be a SEPARATE subagent call (isolated context).
- Pass only structured data between agents — never raw reasoning.
- The Critic must NOT see the Runner's or Converter's reasoning, only the proposal list.
- Only the Arbitrator may edit `rule-config.ts`.
- Steps 1 and 3 are CLI commands — run them directly with Bash, NOT as subagents.
- ALL agents must write to the SAME log file generated in Step 0.
