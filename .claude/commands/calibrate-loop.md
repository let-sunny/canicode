Run a calibration debate loop: 3 subagents discuss and apply rule score adjustments.

Input: $ARGUMENTS (fixture path, e.g. `fixtures/material3-kit.json`)

## Instructions

You are the orchestrator. Do NOT make calibration decisions yourself. Only pass data between agents.

### Step 1 — Runner

Spawn the `calibration-runner` subagent with this prompt:

> Analyze this fixture: $ARGUMENTS

Wait for the Runner to complete. Capture its full report (proposals list).
If Runner returns "No calibration adjustments needed", stop here.

### Step 2 — Critic

Spawn the `calibration-critic` subagent with this prompt:

> Review these Runner proposals:
> (paste Runner's proposals section only — NOT the reasoning chain)

Wait for the Critic to complete. Capture its full critique (APPROVE/REJECT/REVISE per rule).

### Step 3 — Arbitrator

Spawn the `calibration-arbitrator` subagent with this prompt:

> Here are the Runner proposals and Critic reviews. Make final decisions.
>
> Runner proposals:
> (paste Runner's proposals)
>
> Critic reviews:
> (paste Critic's reviews)
>
> Fixture: $ARGUMENTS

Wait for the Arbitrator to complete.

### Done

Report the final summary from the Arbitrator.

## Rules

- Each agent must be a SEPARATE subagent call (isolated context).
- Pass only structured data between agents — never raw reasoning.
- The Critic must NOT see the Runner's reasoning, only the proposal list.
- Only the Arbitrator may edit `rule-config.ts`.
