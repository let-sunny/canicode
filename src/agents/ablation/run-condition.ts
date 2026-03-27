/**
 * Ablation condition experiments: tests that change viewport or prompt, not just strip data.
 *
 * Experiment 1: size-constraints
 *   - Reuse baseline HTML from run-phase1
 *   - Render at 1920px viewport instead of 1200px
 *   - Compare against screenshot-1920.png
 *   - No API call needed
 *
 * Experiment 2: hover-interaction
 *   - Strip [hover]: data from design-tree
 *   - Send to Claude with same prompt
 *   - Compare: does AI invent hover states vs using provided data?
 *   - 1 API call needed
 *
 * Usage:
 *   npx tsx src/agents/ablation/run-condition.ts --type size-constraints
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/agents/ablation/run-condition.ts --type hover-interaction
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — required for hover-interaction only
 *   ABLATION_FIXTURES  — comma-separated (default: 3 desktop fixtures)
 *
 * Output: logs/ablation/conditions/{type}/{fixture}/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { generateDesignTree } from "../../core/engine/design-tree.js";
import { stripDesignTree } from "../../core/engine/design-tree-strip.js";
import { loadFigmaFileFromJson } from "../../core/adapters/figma-file-loader.js";
import { renderCodeScreenshot } from "../../core/engine/visual-compare.js";
import { compareScreenshots } from "../../core/engine/visual-compare-helpers.js";

// --- Configuration ---

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 32000;
const TEMPERATURE = 0;

const DEFAULT_FIXTURES = [
  "desktop-product-detail",
  "desktop-landing-page",
  "desktop-ai-chat",
];

const OUTPUT_DIR = resolve("logs/ablation/conditions");
const PROMPT_PATH = resolve(".claude/skills/design-to-code/PROMPT.md");

type ConditionType = "size-constraints" | "hover-interaction";

// --- Helpers ---

function getFixtureScreenshotPath(fixture: string, width: number): string {
  return resolve(`fixtures/${fixture}/screenshot-${width}.png`);
}

function getDesignTreeOptions(fixture: string) {
  const fixtureDir = resolve(`fixtures/${fixture}`);
  const vectorDir = join(fixtureDir, "vectors");
  const imageDir = join(fixtureDir, "images");
  return {
    ...(existsSync(vectorDir) ? { vectorDir } : {}),
    ...(existsSync(imageDir) ? { imageDir } : {}),
  };
}

function countCssClasses(html: string): number {
  const styleMatch = html.match(/<style[\s\S]*?<\/style>/i);
  if (!styleMatch) return 0;
  const classes = styleMatch[0].match(/\.[a-zA-Z][\w-]*\s*[{,:]/g);
  return new Set(classes?.map((c) => c.replace(/\s*[{,:]$/, ""))).size;
}

function extractHtml(text: string): { html: string; method: string } {
  const allBlocks = [...text.matchAll(/```(?:html|css|[a-z]*)?\s*\n([\s\S]*?)(?:```|$)/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter((block) => block.includes("<") && block.length > 50);
  if (allBlocks.length === 0) return { html: "", method: "none" };
  const fullDoc = allBlocks.find((b) => /^<!doctype|^<html/i.test(b));
  if (fullDoc) return { html: fullDoc, method: "doctype" };
  const hasBody = allBlocks.find((b) => /<body/i.test(b));
  if (hasBody) return { html: hasBody, method: "body" };
  return { html: allBlocks.reduce((a, b) => (a.length >= b.length ? a : b)), method: "largest" };
}

function sanitizeAndInjectFont(html: string): string {
  let result = html;
  result = result.replace(/^\/\/\s*filename:.*\n/i, "");
  result = result.replace(/<script[\s\S]*?<\/script>/gi, "");
  result = result.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  result = result.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  const fontPath = resolve("assets/fonts/Inter.var.woff2");
  if (existsSync(fontPath)) {
    const fontCss = `@font-face { font-family: "Inter"; src: url("file://${fontPath}") format("woff2"); font-weight: 100 900; }`;
    result = result.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, "");
    result = result.replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/gi, "");
    if (result.includes("<style>")) {
      result = result.replace("<style>", `<style>\n${fontCss}\n`);
    } else if (result.includes("</head>")) {
      result = result.replace("</head>", `<style>${fontCss}</style>\n</head>`);
    }
  }
  return result;
}

// --- Size-constraints experiment ---

async function runSizeConstraints(fixture: string): Promise<void> {
  const runDir = resolve(OUTPUT_DIR, "size-constraints", fixture);
  mkdirSync(runDir, { recursive: true });

  // Find baseline HTML from the most recent phase1 run
  const phase1Dir = resolve("logs/ablation/phase1");
  if (!existsSync(phase1Dir)) {
    console.error(`  ERROR: No phase1 results found at ${phase1Dir}`);
    return;
  }

  // Find latest config version
  const versions = readdirSync(phase1Dir).filter((d) => existsSync(join(phase1Dir, d, fixture, "baseline", "run-0", "output.html")));
  if (versions.length === 0) {
    console.error(`  ERROR: No baseline HTML found for ${fixture} in phase1 results`);
    return;
  }
  const latestVersion = versions.sort().reverse()[0]!;
  const baselineHtml = join(phase1Dir, latestVersion, fixture, "baseline", "run-0", "output.html");

  console.log(`  Using baseline from: ${latestVersion}`);
  copyFileSync(baselineHtml, join(runDir, "output.html"));

  // Copy images
  const fixtureImagesDir = resolve(`fixtures/${fixture}/images`);
  if (existsSync(fixtureImagesDir)) {
    const runImagesDir = join(runDir, "images");
    mkdirSync(runImagesDir, { recursive: true });
    for (const f of readdirSync(fixtureImagesDir)) {
      copyFileSync(join(fixtureImagesDir, f), join(runImagesDir, f));
    }
  }

  // Render at 1920px viewport
  console.log(`  Rendering at 1920px viewport...`);
  const codePngPath = join(runDir, "code-1920.png");
  const figmaScreenshotPath = getFixtureScreenshotPath(fixture, 1920);
  if (!existsSync(figmaScreenshotPath)) {
    console.error(`  ERROR: screenshot-1920.png not found for ${fixture}`);
    return;
  }

  const { PNG } = await import("pngjs");
  const figmaImage = PNG.sync.read(readFileSync(figmaScreenshotPath));
  const exportScale = 1; // 1920px screenshots are @1x
  const logicalW = Math.max(1, Math.round(figmaImage.width / exportScale));
  const logicalH = Math.max(1, Math.round(figmaImage.height / exportScale));

  await renderCodeScreenshot(join(runDir, "output.html"), codePngPath, { width: logicalW, height: logicalH }, exportScale);

  // Copy figma screenshot
  const figmaCopyPath = join(runDir, "figma-1920.png");
  copyFileSync(figmaScreenshotPath, figmaCopyPath);

  // Crop to matching dimensions
  const codeImage = PNG.sync.read(readFileSync(codePngPath));
  const figmaCopy = PNG.sync.read(readFileSync(figmaCopyPath));
  const cropW = Math.min(codeImage.width, figmaCopy.width);
  const cropH = Math.min(codeImage.height, figmaCopy.height);

  if (codeImage.width !== cropW || codeImage.height !== cropH) {
    const cropped = new PNG({ width: cropW, height: cropH });
    for (let y = 0; y < cropH; y++) {
      codeImage.data.copy(cropped.data, y * cropW * 4, y * codeImage.width * 4, y * codeImage.width * 4 + cropW * 4);
    }
    writeFileSync(codePngPath, PNG.sync.write(cropped));
  }
  if (figmaCopy.width !== cropW || figmaCopy.height !== cropH) {
    const cropped = new PNG({ width: cropW, height: cropH });
    for (let y = 0; y < cropH; y++) {
      figmaCopy.data.copy(cropped.data, y * cropW * 4, y * figmaCopy.width * 4, y * figmaCopy.width * 4 + cropW * 4);
    }
    writeFileSync(figmaCopyPath, PNG.sync.write(cropped));
  }

  // Compare
  const diffPath = join(runDir, "diff-1920.png");
  const comparison = compareScreenshots(figmaCopyPath, codePngPath, diffPath);

  // Also get baseline similarity at 1200px for comparison
  const baselineResultPath = join(phase1Dir, latestVersion, fixture, "baseline", "run-0", "result.json");
  let baseSim = "?";
  if (existsSync(baselineResultPath)) {
    const br = JSON.parse(readFileSync(baselineResultPath, "utf-8")) as { similarity?: number };
    if (br.similarity !== undefined) baseSim = br.similarity.toFixed(1);
  }

  const result = {
    fixture,
    type: "size-constraints",
    baselineVersion: latestVersion,
    similarity1200: baseSim,
    similarity1920: comparison.similarity,
    deltaResponsive: baseSim !== "?" ? Number(baseSim) - comparison.similarity : null,
    viewport: { width: logicalW, height: logicalH },
    timestamp: new Date().toISOString(),
  };

  writeFileSync(join(runDir, "result.json"), JSON.stringify(result, null, 2));
  console.log(`  ✓ sim@1200=${baseSim}% sim@1920=${comparison.similarity.toFixed(1)}% delta=${result.deltaResponsive?.toFixed(1) ?? "?"}%`);
}

// --- Hover-interaction experiment ---

async function runHoverInteraction(fixture: string): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("  ERROR: ANTHROPIC_API_KEY required for hover-interaction experiment");
    return;
  }

  const runDir = resolve(OUTPUT_DIR, "hover-interaction", fixture);
  mkdirSync(runDir, { recursive: true });

  const prompt = readFileSync(PROMPT_PATH, "utf-8");
  const client = new Anthropic({ apiKey });

  // Generate design-tree WITHOUT [hover]: data
  const file = await loadFigmaFileFromJson(resolve(`fixtures/${fixture}/data.json`));
  const options = getDesignTreeOptions(fixture);
  const fullTree = generateDesignTree(file, options);
  const strippedTree = stripDesignTree(fullTree, "hover-interaction-states");

  writeFileSync(join(runDir, "design-tree-no-hover.txt"), strippedTree);

  // Check if hover data actually exists
  const hoverCount = (fullTree.match(/\[hover\]:/g) ?? []).length;
  if (hoverCount === 0) {
    console.log(`  No [hover]: data in this fixture — skipping`);
    return;
  }
  console.log(`  ${hoverCount} [hover]: blocks in original, stripped for experiment`);

  // Call API with stripped tree
  console.log(`  Calling Claude API (without hover data)...`);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: prompt,
    messages: [{ role: "user", content: strippedTree }],
  });
  const response = await stream.finalMessage();

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  writeFileSync(join(runDir, "response.txt"), responseText);

  const { html } = extractHtml(responseText);
  const finalHtml = sanitizeAndInjectFont(html);
  writeFileSync(join(runDir, "output-no-hover.html"), finalHtml);

  // Check: did AI invent hover CSS anyway?
  const hoverCssCount = (finalHtml.match(/:hover\s*\{/g) ?? []).length;

  // Compare with baseline (which had hover data)
  const phase1Dir = resolve("logs/ablation/phase1");
  const versions = readdirSync(phase1Dir).filter((d) => existsSync(join(phase1Dir, d, fixture, "baseline", "run-0", "output.html")));
  const latestVersion = versions.sort().reverse()[0];
  let baselineHoverCount = 0;
  if (latestVersion) {
    const baselineHtml = readFileSync(join(phase1Dir, latestVersion, fixture, "baseline", "run-0", "output.html"), "utf-8");
    baselineHoverCount = (baselineHtml.match(/:hover\s*\{/g) ?? []).length;
  }

  // Render and compare
  console.log(`  Rendering...`);
  const codePngPath = join(runDir, "code.png");
  const figmaScreenshotPath = getFixtureScreenshotPath(fixture, 1200);
  const { PNG } = await import("pngjs");
  const figmaImage = PNG.sync.read(readFileSync(figmaScreenshotPath));
  const exportScale = 2;
  const logicalW = Math.max(1, Math.round(figmaImage.width / exportScale));
  const logicalH = Math.max(1, Math.round(figmaImage.height / exportScale));

  // Copy images
  const fixtureImagesDir = resolve(`fixtures/${fixture}/images`);
  if (existsSync(fixtureImagesDir)) {
    const runImagesDir = join(runDir, "images");
    mkdirSync(runImagesDir, { recursive: true });
    for (const f of readdirSync(fixtureImagesDir)) {
      copyFileSync(join(fixtureImagesDir, f), join(runImagesDir, f));
    }
  }

  await renderCodeScreenshot(join(runDir, "output-no-hover.html"), codePngPath, { width: logicalW, height: logicalH }, exportScale);

  const figmaCopyPath = join(runDir, "figma.png");
  copyFileSync(figmaScreenshotPath, figmaCopyPath);

  // Crop
  const codeImage = PNG.sync.read(readFileSync(codePngPath));
  const figmaCopy = PNG.sync.read(readFileSync(figmaCopyPath));
  const cropW = Math.min(codeImage.width, figmaCopy.width);
  const cropH = Math.min(codeImage.height, figmaCopy.height);
  if (codeImage.width !== cropW || codeImage.height !== cropH) {
    const cropped = new PNG({ width: cropW, height: cropH });
    for (let y = 0; y < cropH; y++) {
      codeImage.data.copy(cropped.data, y * cropW * 4, y * codeImage.width * 4, y * codeImage.width * 4 + cropW * 4);
    }
    writeFileSync(codePngPath, PNG.sync.write(cropped));
  }

  const diffPath = join(runDir, "diff.png");
  const comparison = compareScreenshots(figmaCopyPath, codePngPath, diffPath);

  const result = {
    fixture,
    type: "hover-interaction",
    hoverBlocksInDesignTree: hoverCount,
    hoverCssWithData: baselineHoverCount,
    hoverCssWithoutData: hoverCssCount,
    similarity: comparison.similarity,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    htmlBytes: Buffer.byteLength(finalHtml, "utf-8"),
    cssClassCount: countCssClasses(finalHtml),
    timestamp: new Date().toISOString(),
  };

  writeFileSync(join(runDir, "result.json"), JSON.stringify(result, null, 2));
  console.log(`  ✓ sim=${comparison.similarity.toFixed(1)}% hover_with=${baselineHoverCount} hover_without=${hoverCssCount}`);
}

// --- Main ---

async function main(): Promise<void> {
  const type = process.argv[2] === "--type" ? process.argv[3] as ConditionType : null;
  if (!type || !["size-constraints", "hover-interaction"].includes(type)) {
    console.error("Usage: npx tsx run-condition.ts --type <size-constraints|hover-interaction>");
    process.exit(1);
  }

  const fixtures = process.env["ABLATION_FIXTURES"]
    ? process.env["ABLATION_FIXTURES"].split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_FIXTURES;

  console.log(`Condition experiment: ${type}`);
  console.log(`Fixtures: ${fixtures.join(", ")}`);
  console.log("");

  for (const fixture of fixtures) {
    console.log(`=== ${fixture} ===`);
    try {
      if (type === "size-constraints") {
        await runSizeConstraints(fixture);
      } else {
        await runHoverInteraction(fixture);
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
