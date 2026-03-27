/**
 * Ablation condition experiments: tests that change viewport or prompt context.
 *
 * Experiment 1: size-constraints
 *   - Strip size-constraints from design-tree
 *   - Implement via API
 *   - Remove root fixed width from generated HTML
 *   - Render at expanded viewport (desktop: 1920px, mobile: 768px)
 *   - Compare against expanded viewport screenshot
 *   - Also render baseline (un-stripped) at expanded viewport for comparison
 *
 * Experiment 2: hover-interaction
 *   - Strip [hover]: data from design-tree
 *   - Implement via API
 *   - Compare hover CSS values with baseline (which had [hover]: data)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/agents/ablation/run-condition.ts --type size-constraints
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/agents/ablation/run-condition.ts --type hover-interaction
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — required
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

function getDesignTreeOptions(fixture: string) {
  const fixtureDir = resolve(`fixtures/${fixture}`);
  const vectorDir = join(fixtureDir, "vectors");
  const imageDir = join(fixtureDir, "images");
  return {
    ...(existsSync(vectorDir) ? { vectorDir } : {}),
    ...(existsSync(imageDir) ? { imageDir } : {}),
  };
}

function extractHtml(text: string): string {
  const allBlocks = [...text.matchAll(/```(?:html|css|[a-z]*)?\s*\n([\s\S]*?)(?:```|$)/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter((block) => block.includes("<") && block.length > 50);
  if (allBlocks.length === 0) return "";
  const fullDoc = allBlocks.find((b) => /^<!doctype|^<html/i.test(b));
  if (fullDoc) return fullDoc;
  const hasBody = allBlocks.find((b) => /<body/i.test(b));
  if (hasBody) return hasBody;
  return allBlocks.reduce((a, b) => (a.length >= b.length ? a : b));
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

/** Remove root element's fixed width (e.g., width: 1200px or width: 375px) from CSS. */
function removeRootFixedWidth(html: string): string {
  // Replace width: NNNpx on the first element style or in CSS for root-like selectors
  // Match patterns like: width: 1200px, width: 375px, min-width: 1200px
  return html
    .replace(/width:\s*1200px/g, "width: 100%")
    .replace(/width:\s*375px/g, "width: 100%")
    .replace(/min-width:\s*1200px/g, "min-width: 0")
    .replace(/min-width:\s*375px/g, "min-width: 0");
}

function copyFixtureImages(fixture: string, runDir: string): void {
  const fixtureImagesDir = resolve(`fixtures/${fixture}/images`);
  if (existsSync(fixtureImagesDir)) {
    const runImagesDir = join(runDir, "images");
    mkdirSync(runImagesDir, { recursive: true });
    for (const f of readdirSync(fixtureImagesDir)) {
      copyFileSync(join(fixtureImagesDir, f), join(runImagesDir, f));
    }
  }
}

async function callApi(client: Anthropic, prompt: string, designTree: string): Promise<Anthropic.Message> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: prompt,
        messages: [{ role: "user", content: designTree }],
      });
      return await stream.finalMessage();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if ((status === 429 || status === 529) && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(`    ⚠ ${status} error, retrying in ${delay / 1000}s (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("API call failed after retries");
}

async function renderAndCompare(
  htmlPath: string,
  figmaScreenshotPath: string,
  runDir: string,
  suffix: string,
): Promise<{ similarity: number }> {
  const { PNG } = await import("pngjs");
  const figmaImage = PNG.sync.read(readFileSync(figmaScreenshotPath));
  // Detect scale: 1920/768 screenshots are @1x, 1200/375 are @2x
  const figmaWidth = figmaImage.width;
  const exportScale = figmaWidth > 1500 ? 1 : 2; // 1920px screenshot is @1x
  const logicalW = Math.max(1, Math.round(figmaWidth / exportScale));
  const logicalH = Math.max(1, Math.round(figmaImage.height / exportScale));

  const codePngPath = join(runDir, `code-${suffix}.png`);
  await renderCodeScreenshot(htmlPath, codePngPath, { width: logicalW, height: logicalH }, exportScale);

  const figmaCopyPath = join(runDir, `figma-${suffix}.png`);
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

  const diffPath = join(runDir, `diff-${suffix}.png`);
  return compareScreenshots(figmaCopyPath, codePngPath, diffPath);
}

// --- Size-constraints experiment ---

async function runSizeConstraints(fixture: string, client: Anthropic, prompt: string): Promise<void> {
  const isMobile = fixture.startsWith("mobile-");
  const baseWidth = isMobile ? 375 : 1200;
  const expandedWidth = isMobile ? 768 : 1920;

  const runDir = resolve(OUTPUT_DIR, "size-constraints", fixture);
  mkdirSync(runDir, { recursive: true });

  const expandedScreenshot = resolve(`fixtures/${fixture}/screenshot-${expandedWidth}.png`);
  if (!existsSync(expandedScreenshot)) {
    console.error(`  ERROR: screenshot-${expandedWidth}.png not found for ${fixture}`);
    return;
  }

  // Load fixture and generate design-trees
  const file = await loadFigmaFileFromJson(resolve(`fixtures/${fixture}/data.json`));
  const options = getDesignTreeOptions(fixture);
  const baselineTree = generateDesignTree(file, options);
  const strippedTree = stripDesignTree(baselineTree, "size-constraints");

  copyFixtureImages(fixture, runDir);

  // 1. Baseline: implement with full info → render at expanded viewport
  console.log(`  [baseline] Calling API...`);
  const baseResponse = await callApi(client, prompt, baselineTree);
  const baseHtml = sanitizeAndInjectFont(extractHtml(
    baseResponse.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n")
  ));
  const baseHtmlExpanded = removeRootFixedWidth(baseHtml);
  writeFileSync(join(runDir, "output-baseline.html"), baseHtml);
  writeFileSync(join(runDir, "output-baseline-expanded.html"), baseHtmlExpanded);

  console.log(`  [baseline] Rendering at ${expandedWidth}px...`);
  const baseResult = await renderAndCompare(
    join(runDir, "output-baseline-expanded.html"),
    expandedScreenshot,
    runDir,
    `baseline-${expandedWidth}`,
  );

  // 2. Stripped: implement without size info → render at expanded viewport
  console.log(`  [stripped] Calling API...`);
  const stripResponse = await callApi(client, prompt, strippedTree);
  const stripHtml = sanitizeAndInjectFont(extractHtml(
    stripResponse.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n")
  ));
  const stripHtmlExpanded = removeRootFixedWidth(stripHtml);
  writeFileSync(join(runDir, "output-stripped.html"), stripHtml);
  writeFileSync(join(runDir, "output-stripped-expanded.html"), stripHtmlExpanded);

  console.log(`  [stripped] Rendering at ${expandedWidth}px...`);
  const stripResult = await renderAndCompare(
    join(runDir, "output-stripped-expanded.html"),
    expandedScreenshot,
    runDir,
    `stripped-${expandedWidth}`,
  );

  const deltaV = baseResult.similarity - stripResult.similarity;

  const result = {
    fixture,
    type: "size-constraints",
    baseWidth,
    expandedWidth,
    baselineSimilarity: baseResult.similarity,
    strippedSimilarity: stripResult.similarity,
    deltaV,
    baselineTokens: { input: baseResponse.usage.input_tokens, output: baseResponse.usage.output_tokens },
    strippedTokens: { input: stripResponse.usage.input_tokens, output: stripResponse.usage.output_tokens },
    timestamp: new Date().toISOString(),
  };

  writeFileSync(join(runDir, "result.json"), JSON.stringify(result, null, 2));
  console.log(`  ✓ baseline@${expandedWidth}=${baseResult.similarity.toFixed(1)}% stripped@${expandedWidth}=${stripResult.similarity.toFixed(1)}% ΔV=${deltaV.toFixed(1)}%`);
}

// --- Hover-interaction experiment ---

async function runHoverInteraction(fixture: string, client: Anthropic, prompt: string): Promise<void> {
  const runDir = resolve(OUTPUT_DIR, "hover-interaction", fixture);
  mkdirSync(runDir, { recursive: true });

  const file = await loadFigmaFileFromJson(resolve(`fixtures/${fixture}/data.json`));
  const options = getDesignTreeOptions(fixture);
  const fullTree = generateDesignTree(file, options);
  const strippedTree = stripDesignTree(fullTree, "hover-interaction-states");

  const hoverCount = (fullTree.match(/\[hover\]:/g) ?? []).length;
  if (hoverCount === 0) {
    console.log(`  No [hover]: data in this fixture — skipping`);
    return;
  }
  console.log(`  ${hoverCount} [hover]: blocks in original`);

  writeFileSync(join(runDir, "design-tree-full.txt"), fullTree);
  writeFileSync(join(runDir, "design-tree-no-hover.txt"), strippedTree);

  copyFixtureImages(fixture, runDir);

  // 1. Baseline: with hover data
  console.log(`  [with hover] Calling API...`);
  const baseResponse = await callApi(client, prompt, fullTree);
  const baseText = baseResponse.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  const baseHtml = sanitizeAndInjectFont(extractHtml(baseText));
  writeFileSync(join(runDir, "output-with-hover.html"), baseHtml);

  // 2. Stripped: without hover data
  console.log(`  [without hover] Calling API...`);
  const stripResponse = await callApi(client, prompt, strippedTree);
  const stripText = stripResponse.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  const stripHtml = sanitizeAndInjectFont(extractHtml(stripText));
  writeFileSync(join(runDir, "output-without-hover.html"), stripHtml);

  // Extract :hover rules from both
  const baseHoverRules = baseHtml.match(/[^}]*:hover\s*\{[^}]*\}/g) ?? [];
  const stripHoverRules = stripHtml.match(/[^}]*:hover\s*\{[^}]*\}/g) ?? [];

  const result = {
    fixture,
    type: "hover-interaction",
    hoverBlocksInDesignTree: hoverCount,
    withHoverData: {
      hoverCssRules: baseHoverRules.length,
      hoverCssContent: baseHoverRules,
      inputTokens: baseResponse.usage.input_tokens,
      outputTokens: baseResponse.usage.output_tokens,
      htmlBytes: Buffer.byteLength(baseHtml, "utf-8"),
    },
    withoutHoverData: {
      hoverCssRules: stripHoverRules.length,
      hoverCssContent: stripHoverRules,
      inputTokens: stripResponse.usage.input_tokens,
      outputTokens: stripResponse.usage.output_tokens,
      htmlBytes: Buffer.byteLength(stripHtml, "utf-8"),
    },
    timestamp: new Date().toISOString(),
  };

  writeFileSync(join(runDir, "result.json"), JSON.stringify(result, null, 2));
  console.log(`  ✓ with_hover: ${baseHoverRules.length} :hover rules, without_hover: ${stripHoverRules.length} :hover rules`);
  if (baseHoverRules.length > 0) {
    console.log(`  Hover rules with data:`);
    for (const rule of baseHoverRules) console.log(`    ${rule.trim().slice(0, 80)}`);
  }
  if (stripHoverRules.length > 0) {
    console.log(`  Hover rules WITHOUT data (AI invented):`);
    for (const rule of stripHoverRules) console.log(`    ${rule.trim().slice(0, 80)}`);
  }
}

// --- Main ---

async function main(): Promise<void> {
  const typeArg = process.argv.indexOf("--type");
  const type = typeArg !== -1 ? process.argv[typeArg + 1] as ConditionType | undefined : undefined;
  if (!type || !["size-constraints", "hover-interaction"].includes(type)) {
    console.error("Usage: npx tsx run-condition.ts --type <size-constraints|hover-interaction>");
    process.exit(1);
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY required");
    process.exit(1);
  }

  const prompt = readFileSync(PROMPT_PATH, "utf-8");
  const client = new Anthropic({ apiKey });

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
        await runSizeConstraints(fixture, client, prompt);
      } else {
        await runHoverInteraction(fixture, client, prompt);
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
