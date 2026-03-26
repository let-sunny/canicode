/**
 * Ablation pilot orchestrator.
 * Validates that thinking token increase (deltaT) is a stable signal
 * by running 3 rules x 2 repetitions + 2 baseline runs = 8 converter runs per fixture.
 *
 * Usage: npx tsx src/agents/ablation/pilot.ts <fixture-dir>
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { loadFile } from "../../core/engine/loader.js";
import { generateDesignTree } from "../../core/engine/design-tree.js";
import { renderCodeScreenshot } from "../../core/engine/visual-compare.js";
import { compareScreenshots } from "../../core/engine/visual-compare-helpers.js";
import { stripForRule, PILOT_RULE_IDS } from "./design-tree-stripper.js";
import { runAblation } from "./ablation-runner.js";
import { buildHtmlWrapper } from "../code-renderer.js";

// --- Types ---

interface RepResult {
  thinkingTokens: number;
  outputTokens: number;
  visualSimilarity: number;
}

interface AblationResult {
  reps: RepResult[];
  avgDeltaT: number;
  avgDeltaV: number;
  deltaT_cv: number;
  deltaV_cv: number;
}

interface PilotResults {
  fixture: string;
  timestamp: string;
  repetitions: number;
  baseline: {
    reps: RepResult[];
  };
  ablations: Record<string, AblationResult>;
  validation: {
    deltaT_stable: boolean;
    deltaV_direction_correct: boolean;
    strip_clean: boolean;
    pass: boolean;
  };
}

// --- Constants ---

const REPETITIONS = 2;
const ABLATION_DIR = "logs/ablation";
const CV_THRESHOLD = 0.30; // Coefficient of variation < 30% = stable

// --- Helpers ---

function getTimestamp(): string {
  return new Date().toISOString();
}

function getTimestampSlug(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}${minutes}`;
}

/** Compute coefficient of variation (stddev / mean). Returns 0 if mean is 0. */
function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/** Run visual comparison between generated HTML and fixture screenshot. */
async function measureVisualSimilarity(
  html: string,
  fixtureScreenshotPath: string,
  outputDir: string,
  repLabel: string,
): Promise<number> {
  // Write HTML to a temp file
  const htmlPath = join(outputDir, `${repLabel}.html`);
  const wrappedHtml = buildHtmlWrapper(html);
  writeFileSync(htmlPath, wrappedHtml);

  // Read the fixture screenshot to get dimensions
  const { PNG } = await import("pngjs");
  const figmaPng = PNG.sync.read(readFileSync(fixtureScreenshotPath));

  // Assume fixture screenshot is @2x (standard from save-fixture)
  const exportScale = 2;
  const logicalW = Math.max(1, Math.round(figmaPng.width / exportScale));
  const logicalH = Math.max(1, Math.round(figmaPng.height / exportScale));

  // Render code screenshot
  const codePngPath = join(outputDir, `${repLabel}-code.png`);
  await renderCodeScreenshot(htmlPath, codePngPath, { width: logicalW, height: logicalH }, exportScale);

  // Copy fixture screenshot for comparison
  const figmaPngPath = join(outputDir, `${repLabel}-figma.png`);
  copyFileSync(fixtureScreenshotPath, figmaPngPath);

  // Compare
  const diffPath = join(outputDir, `${repLabel}-diff.png`);
  const result = compareScreenshots(figmaPngPath, codePngPath, diffPath);

  return result.similarity;
}

/** Run one conversion and measure results. */
async function runOneConversion(
  designTree: string,
  fixtureScreenshotPath: string,
  outputDir: string,
  repLabel: string,
): Promise<RepResult> {
  console.error(`  Running conversion: ${repLabel}...`);

  const ablationResult = await runAblation(designTree);

  // Measure visual similarity (also saves the HTML file)
  let visualSimilarity = 0;
  try {
    visualSimilarity = await measureVisualSimilarity(
      ablationResult.html,
      fixtureScreenshotPath,
      outputDir,
      repLabel,
    );
  } catch (err) {
    // If visual comparison fails, still save the HTML for inspection
    const htmlPath = join(outputDir, `${repLabel}.html`);
    writeFileSync(htmlPath, buildHtmlWrapper(ablationResult.html));
    console.error(`  Warning: visual comparison failed for ${repLabel}: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.error(`  ${repLabel}: thinking=${ablationResult.thinkingTokens}, output=${ablationResult.outputTokens}, similarity=${visualSimilarity}%`);

  return {
    thinkingTokens: ablationResult.thinkingTokens,
    outputTokens: ablationResult.outputTokens,
    visualSimilarity,
  };
}

// --- Main orchestrator ---

async function runPilot(fixtureDir: string): Promise<PilotResults> {
  const resolvedDir = resolve(fixtureDir);
  const dataPath = join(resolvedDir, "data.json");
  const screenshotPath = join(resolvedDir, "screenshot.png");

  if (!existsSync(dataPath)) {
    throw new Error(`Fixture data.json not found: ${dataPath}`);
  }
  if (!existsSync(screenshotPath)) {
    throw new Error(`Fixture screenshot.png not found: ${screenshotPath}`);
  }

  const fixtureName = basename(resolvedDir);
  const timestamp = getTimestamp();
  const timestampSlug = getTimestampSlug();

  // Create run directory
  const runDir = resolve(ABLATION_DIR, `pilot--${timestampSlug}`);
  mkdirSync(runDir, { recursive: true });

  console.error(`\nAblation Pilot: ${fixtureName}`);
  console.error(`Run directory: ${runDir}`);
  console.error(`Repetitions: ${REPETITIONS}`);
  console.error(`Rules: ${PILOT_RULE_IDS.join(", ")}\n`);

  // Load fixture and generate design tree
  console.error("Loading fixture...");
  const { file } = await loadFile(resolvedDir);
  const vectorDir = join(resolvedDir, "vectors");
  const treeOptions = existsSync(vectorDir) ? { vectorDir } : {};
  const designTree = generateDesignTree(file, treeOptions);

  // Save design tree for reference
  writeFileSync(join(runDir, "design-tree.txt"), designTree);

  // Verify stripping works cleanly for all pilot rules
  let stripClean = true;
  for (const ruleId of PILOT_RULE_IDS) {
    try {
      const stripped = stripForRule(designTree, ruleId);
      if (stripped === designTree) {
        console.error(`  Warning: strip for ${ruleId} had no effect — rule may not be present in this fixture`);
      }
      // Save stripped trees for reference
      const strippedDir = join(runDir, "stripped", ruleId);
      mkdirSync(strippedDir, { recursive: true });
      writeFileSync(join(strippedDir, "design-tree.txt"), stripped);
    } catch (err) {
      console.error(`  Error: strip failed for ${ruleId}: ${err instanceof Error ? err.message : String(err)}`);
      stripClean = false;
    }
  }

  // --- Run baseline ---
  console.error("\n--- Baseline runs ---");
  const baselineDir = join(runDir, "baseline");
  mkdirSync(baselineDir, { recursive: true });
  const baselineReps: RepResult[] = [];

  for (let rep = 1; rep <= REPETITIONS; rep++) {
    const result = await runOneConversion(
      designTree,
      screenshotPath,
      baselineDir,
      `rep-${rep}`,
    );
    baselineReps.push(result);
  }

  // --- Run ablations for each pilot rule ---
  const ablations: Record<string, AblationResult> = {};

  for (const ruleId of PILOT_RULE_IDS) {
    console.error(`\n--- Ablation: ${ruleId} ---`);
    const ruleDir = join(runDir, "stripped", ruleId);
    mkdirSync(ruleDir, { recursive: true });

    const strippedTree = stripForRule(designTree, ruleId);
    const ruleReps: RepResult[] = [];

    for (let rep = 1; rep <= REPETITIONS; rep++) {
      const result = await runOneConversion(
        strippedTree,
        screenshotPath,
        ruleDir,
        `rep-${rep}`,
      );
      ruleReps.push(result);
    }

    // Compute deltas relative to baseline
    const avgBaselineT = baselineReps.reduce((s, r) => s + r.thinkingTokens, 0) / baselineReps.length;
    const avgBaselineV = baselineReps.reduce((s, r) => s + r.visualSimilarity, 0) / baselineReps.length;
    const avgRuleT = ruleReps.reduce((s, r) => s + r.thinkingTokens, 0) / ruleReps.length;
    const avgRuleV = ruleReps.reduce((s, r) => s + r.visualSimilarity, 0) / ruleReps.length;

    const avgDeltaT = avgRuleT - avgBaselineT;
    const avgDeltaV = avgRuleV - avgBaselineV;

    // Per-rep deltas for CV calculation
    const deltaTs = ruleReps.map((r) => r.thinkingTokens - avgBaselineT);
    const deltaVs = ruleReps.map((r) => r.visualSimilarity - avgBaselineV);

    ablations[ruleId] = {
      reps: ruleReps,
      avgDeltaT: Math.round(avgDeltaT),
      avgDeltaV: Math.round(avgDeltaV * 10) / 10,
      deltaT_cv: Math.round(coefficientOfVariation(deltaTs) * 100) / 100,
      deltaV_cv: Math.round(coefficientOfVariation(deltaVs) * 100) / 100,
    };
  }

  // --- Validation ---
  const deltaTStable = Object.values(ablations).every(
    (a) => a.deltaT_cv < CV_THRESHOLD,
  );
  // deltaV should be negative (worse similarity when info is stripped)
  const deltaVDirectionCorrect = Object.values(ablations).every(
    (a) => a.avgDeltaV <= 0,
  );

  const validation = {
    deltaT_stable: deltaTStable,
    deltaV_direction_correct: deltaVDirectionCorrect,
    strip_clean: stripClean,
    pass: deltaTStable && deltaVDirectionCorrect && stripClean,
  };

  const results: PilotResults = {
    fixture: fixtureName,
    timestamp,
    repetitions: REPETITIONS,
    baseline: { reps: baselineReps },
    ablations,
    validation,
  };

  // Save results
  writeFileSync(join(runDir, "results.json"), JSON.stringify(results, null, 2));

  // Generate summary
  const summary = generateSummary(results);
  writeFileSync(join(runDir, "summary.md"), summary);

  console.error("\n" + summary);
  console.error(`\nResults saved to: ${runDir}`);

  return results;
}

/** Generate a human-readable summary of pilot results. */
function generateSummary(results: PilotResults): string {
  const lines: string[] = [];

  lines.push(`# Ablation Pilot Results`);
  lines.push(``);
  lines.push(`- **Fixture**: ${results.fixture}`);
  lines.push(`- **Timestamp**: ${results.timestamp}`);
  lines.push(`- **Repetitions**: ${results.repetitions}`);
  lines.push(``);

  // Baseline
  lines.push(`## Baseline`);
  lines.push(``);
  lines.push(`| Rep | Thinking Tokens | Output Tokens | Visual Similarity |`);
  lines.push(`|-----|-----------------|---------------|-------------------|`);
  for (let i = 0; i < results.baseline.reps.length; i++) {
    const r = results.baseline.reps[i]!;
    lines.push(`| ${i + 1} | ${r.thinkingTokens} | ${r.outputTokens} | ${r.visualSimilarity}% |`);
  }
  lines.push(``);

  // Ablations
  lines.push(`## Ablations`);
  lines.push(``);
  for (const [ruleId, ablation] of Object.entries(results.ablations)) {
    lines.push(`### ${ruleId}`);
    lines.push(``);
    lines.push(`| Rep | Thinking Tokens | Output Tokens | Visual Similarity |`);
    lines.push(`|-----|-----------------|---------------|-------------------|`);
    for (let i = 0; i < ablation.reps.length; i++) {
      const r = ablation.reps[i]!;
      lines.push(`| ${i + 1} | ${r.thinkingTokens} | ${r.outputTokens} | ${r.visualSimilarity}% |`);
    }
    lines.push(``);
    lines.push(`- **Avg deltaT**: ${ablation.avgDeltaT} tokens (CV: ${ablation.deltaT_cv})`);
    lines.push(`- **Avg deltaV**: ${ablation.avgDeltaV}% (CV: ${ablation.deltaV_cv})`);
    lines.push(``);
  }

  // Validation
  lines.push(`## Validation`);
  lines.push(``);
  lines.push(`| Check | Result |`);
  lines.push(`|-------|--------|`);
  lines.push(`| deltaT run-to-run stability (CV < 30%) | ${results.validation.deltaT_stable ? "PASS" : "FAIL"} |`);
  lines.push(`| deltaV direction correct (negative) | ${results.validation.deltaV_direction_correct ? "PASS" : "FAIL"} |`);
  lines.push(`| Strip definitions clean | ${results.validation.strip_clean ? "PASS" : "FAIL"} |`);
  lines.push(`| **Overall** | **${results.validation.pass ? "PASS" : "FAIL"}** |`);
  lines.push(``);

  return lines.join("\n");
}

// --- CLI entry point ---

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || !args[0]) {
    console.error("Usage: npx tsx src/agents/ablation/pilot.ts <fixture-dir>");
    console.error("Example: npx tsx src/agents/ablation/pilot.ts fixtures/material3-51954-18254");
    process.exit(1);
  }

  const fixtureDir = args[0];

  try {
    const results = await runPilot(fixtureDir);
    // Output JSON to stdout for programmatic consumption
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
