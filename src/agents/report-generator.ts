import type { ScoreReport } from "@/core/engine/scoring.js";
import type { MismatchCase } from "./contracts/evaluation-agent.js";
import type { ScoreAdjustment, NewRuleProposal } from "./contracts/tuning-agent.js";
import type { ElasticityProfile } from "./contracts/evidence.js";

/** Data structure for generating calibration report markdown. */
export interface CalibrationReportData {
  fileKey: string;
  fileName: string;
  analyzedAt: string;
  nodeCount: number;
  issueCount: number;
  convertedNodeCount: number;
  skippedNodeCount: number;
  scoreReport: ScoreReport;
  mismatches: MismatchCase[];
  validatedRules: string[];
  adjustments: ScoreAdjustment[];
  newRuleProposals: NewRuleProposal[];
  /** Design tree token metrics (optional — present when design-tree stats are available) */
  tokenMetrics?: {
    designTreeTokens: number;
    designTreeBytes: number;
    tokensPerNode: number;
  } | undefined;
  /** Per-rule elasticity profiles (optional — present when elasticity data is available) */
  elasticityProfiles?: ElasticityProfile[] | undefined;
}

/**
 * Generate a CALIBRATION_REPORT.md from calibration pipeline results
 */
export function generateCalibrationReport(data: CalibrationReportData): string {
  const lines: string[] = [];

  lines.push("# Calibration Report");
  lines.push("");
  lines.push(renderOverview(data));
  lines.push(renderCurrentScores(data));
  lines.push(renderAdjustmentProposals(data.adjustments));
  if (data.elasticityProfiles && data.elasticityProfiles.length > 0) {
    lines.push(renderElasticityProfiles(data.elasticityProfiles));
  }
  lines.push(renderNewRuleProposals(data.newRuleProposals));
  lines.push(renderValidatedRules(data.validatedRules));
  lines.push(renderMismatchDetails(data.mismatches));
  lines.push(renderApplicationGuide(data.adjustments));

  return lines.join("\n");
}

function renderOverview(data: CalibrationReportData): string {
  return `## Overview

| Metric | Value |
|--------|-------|
| File | ${data.fileName} (${data.fileKey}) |
| Analyzed At | ${data.analyzedAt} |
| Total Nodes | ${data.nodeCount} |
| Total Issues | ${data.issueCount} |
| Converted Nodes | ${data.convertedNodeCount} |
| Skipped Nodes | ${data.skippedNodeCount} |
| Overall Grade | ${data.scoreReport.overall.grade} (${data.scoreReport.overall.percentage}%) |${data.tokenMetrics ? `
| Design Tree Tokens | ~${data.tokenMetrics.designTreeTokens.toLocaleString()} tokens (${Math.round(data.tokenMetrics.designTreeBytes / 1024)}KB) |
| Tokens per Node | ~${Math.round(data.tokenMetrics.tokensPerNode)} |` : ""}
`;
}

function renderCurrentScores(data: CalibrationReportData): string {
  const lines: string[] = [];
  lines.push("## Current Score Summary");
  lines.push("");
  lines.push("| Category | Score | Issues | Density | Diversity |");
  lines.push("|----------|-------|--------|---------|-----------|");

  for (const [category, catScore] of Object.entries(data.scoreReport.byCategory)) {
    lines.push(
      `| ${category} | ${catScore.percentage}% | ${catScore.issueCount} | ${catScore.densityScore} | ${catScore.diversityScore} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderAdjustmentProposals(adjustments: ScoreAdjustment[]): string {
  if (adjustments.length === 0) {
    return "## Score Adjustment Proposals\n\nNo adjustments proposed.\n";
  }

  const lines: string[] = [];
  lines.push("## Score Adjustment Proposals");
  lines.push("");
  lines.push("| Rule | Current Score | Proposed Score | Severity Change | Confidence | Cases | Elasticity | Reasoning |");
  lines.push("|------|--------------|----------------|-----------------|------------|-------|------------|-----------|");

  for (const adj of adjustments) {
    const severityChange = adj.proposedSeverity
      ? `${adj.currentSeverity} -> ${adj.proposedSeverity}`
      : adj.currentSeverity;
    const elasticityCell = adj.elasticity
      ? `${adj.elasticity.meanDelta >= 0 ? "+" : ""}${adj.elasticity.meanDelta}% (${adj.elasticity.confidence})`
      : "—";

    lines.push(
      `| ${adj.ruleId} | ${adj.currentScore} | ${adj.proposedScore} | ${severityChange} | ${adj.confidence} | ${adj.supportingCases} | ${elasticityCell} | ${adj.reasoning} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderElasticityProfiles(profiles: ElasticityProfile[]): string {
  const lines: string[] = [];
  lines.push("## Rule Elasticity (Similarity Delta)");
  lines.push("");
  lines.push("Per-rule impact on visual similarity. Positive delta = rule improves pixel accuracy.");
  lines.push("");
  lines.push("| Rule | Mean Δ | Min Δ | Max Δ | Measurements | Confidence | Fixtures |");
  lines.push("|------|--------|-------|-------|--------------|------------|----------|");

  for (const p of profiles) {
    const sign = p.meanDelta >= 0 ? "+" : "";
    const minSign = p.minDelta >= 0 ? "+" : "";
    const maxSign = p.maxDelta >= 0 ? "+" : "";
    lines.push(
      `| ${p.ruleId} | ${sign}${p.meanDelta}% | ${minSign}${p.minDelta}% | ${maxSign}${p.maxDelta}% | ${p.measurements} | ${p.confidence} | ${p.fixtures.join(", ")} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderNewRuleProposals(proposals: NewRuleProposal[]): string {
  if (proposals.length === 0) {
    return "## New Rule Proposals\n\nNo new rules proposed.\n";
  }

  const lines: string[] = [];
  lines.push("## New Rule Proposals");
  lines.push("");

  for (const proposal of proposals) {
    lines.push(`### ${proposal.suggestedId}`);
    lines.push("");
    lines.push(`- **Category**: ${proposal.category}`);
    lines.push(`- **Suggested Severity**: ${proposal.suggestedSeverity}`);
    lines.push(`- **Suggested Score**: ${proposal.suggestedScore}`);
    lines.push(`- **Supporting Cases**: ${proposal.supportingCases}`);
    lines.push(`- **Description**: ${proposal.description}`);
    lines.push(`- **Reasoning**: ${proposal.reasoning}`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderValidatedRules(validatedRules: string[]): string {
  if (validatedRules.length === 0) {
    return "## Validated Rules\n\nNo rules were validated in this run.\n";
  }

  const lines: string[] = [];
  lines.push("## Validated Rules");
  lines.push("");
  lines.push("The following rules had scores that aligned with actual conversion difficulty:");
  lines.push("");

  for (const ruleId of validatedRules) {
    lines.push(`- \`${ruleId}\``);
  }

  lines.push("");
  return lines.join("\n");
}

function renderMismatchDetails(mismatches: MismatchCase[]): string {
  if (mismatches.length === 0) {
    return "## Detailed Mismatch List\n\nNo mismatches found.\n";
  }

  const lines: string[] = [];
  lines.push("## Detailed Mismatch List");
  lines.push("");

  const grouped: Record<string, MismatchCase[]> = {};
  for (const m of mismatches) {
    const list = grouped[m.type];
    if (list) {
      list.push(m);
    } else {
      grouped[m.type] = [m];
    }
  }

  for (const [type, cases] of Object.entries(grouped)) {
    lines.push(`### ${type} (${cases.length})`);
    lines.push("");

    for (const c of cases) {
      const ruleInfo = c.ruleId ? ` | Rule: \`${c.ruleId}\`` : "";
      const scoreInfo = c.currentScore !== undefined ? ` | Score: ${c.currentScore}` : "";
      lines.push(`- **${c.nodePath}** (${c.nodeId})${ruleInfo}${scoreInfo} | Difficulty: ${c.actualDifficulty}`);
      lines.push(`  > ${c.reasoning}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function renderApplicationGuide(adjustments: ScoreAdjustment[]): string {
  const lines: string[] = [];
  lines.push("## Application Guide");
  lines.push("");
  lines.push("To apply these calibration results:");
  lines.push("");
  lines.push("1. Review each adjustment proposal above");
  lines.push("2. Edit `src/core/rules/rule-config.ts` to update scores and severities");
  lines.push("3. Run `pnpm test:run` to verify no tests break");
  lines.push("4. Re-run calibration to confirm improvements");
  lines.push("");

  if (adjustments.length > 0) {
    lines.push("### Suggested Changes to `rule-config.ts`");
    lines.push("");
    lines.push("```typescript");

    for (const adj of adjustments) {
      lines.push(`// ${adj.ruleId}: ${adj.currentScore} -> ${adj.proposedScore} (${adj.confidence} confidence)`);
      if (adj.proposedSeverity) {
        lines.push(`//   severity: "${adj.currentSeverity}" -> "${adj.proposedSeverity}"`);
      }
    }

    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
