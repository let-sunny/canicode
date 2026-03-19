import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import type {
  PixelComparisonResult,
  DeepComparisonResult,
  VisualComparisonInput,
  VisualComparisonRecord,
} from "./contracts/visual-comparison.js";

/**
 * Decode a base64-encoded PNG into raw RGBA pixel data
 */
function decodePng(base64: string): { data: Uint8Array; width: number; height: number } {
  const buffer = Buffer.from(base64, "base64");
  const png = PNG.sync.read(buffer);
  return {
    data: new Uint8Array(png.data),
    width: png.width,
    height: png.height,
  };
}

/**
 * Compare two PNG images using pixelmatch (deterministic, no cost)
 */
export function compareImages(
  imageABase64: string,
  imageBBase64: string,
  options?: { threshold?: number }
): PixelComparisonResult {
  const imgA = decodePng(imageABase64);
  const imgB = decodePng(imageBBase64);

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      pixelDiffPercentage: 100,
      diffImageBase64: "",
      width: Math.max(imgA.width, imgB.width),
      height: Math.max(imgA.height, imgB.height),
      totalPixels: Math.max(imgA.width * imgA.height, imgB.width * imgB.height),
      diffPixels: Math.max(imgA.width * imgA.height, imgB.width * imgB.height),
      sizeMatch: false,
    };
  }

  const { width, height } = imgA;
  const totalPixels = width * height;
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    imgA.data,
    imgB.data,
    diff.data,
    width,
    height,
    { threshold: options?.threshold ?? 0.1 }
  );

  const diffBuffer = PNG.sync.write(diff);

  return {
    pixelDiffPercentage: totalPixels > 0
      ? Math.round((diffPixels / totalPixels) * 10000) / 100
      : 0,
    diffImageBase64: diffBuffer.toString("base64"),
    width,
    height,
    totalPixels,
    diffPixels,
    sizeMatch: true,
  };
}

const DEEP_COMPARE_PROMPT = `You are comparing two images of a UI design:
- Image 1: The original Figma design
- Image 2: An AI-generated code implementation rendered in a browser

Analyze the visual differences and respond with a JSON object:

{
  "similarityScore": <number 0-100, where 100 = identical>,
  "diffAreas": [<string descriptions of visual differences>],
  "causeRuleIds": [<rule IDs that might explain the differences>]
}

Possible rule IDs to reference:
- no-auto-layout, absolute-position-in-auto-layout, fixed-width-in-responsive-context
- missing-responsive-behavior, group-usage, deep-nesting
- raw-color, raw-font, inconsistent-spacing, magic-number-spacing
- missing-component, detached-instance, default-name, non-semantic-name
- ambiguous-structure, z-index-dependent-layout, hardcode-risk

Only include rule IDs where you can clearly see the design issue causing a visual difference.
Respond with ONLY the JSON object, no markdown fences or extra text.`;

/**
 * Deep compare two images using Claude Vision API (optional, costs money)
 */
export async function deepCompareImages(
  figmaBase64: string,
  renderedBase64: string,
  apiKey: string
): Promise<DeepComparisonResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: figmaBase64,
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: renderedBase64,
              },
            },
            {
              type: "text",
              text: DEEP_COMPARE_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${body}`);
  }

  const json = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = json.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text response from Anthropic API");
  }

  const parsed = JSON.parse(textBlock.text) as DeepComparisonResult;

  return {
    similarityScore: parsed.similarityScore ?? 0,
    diffAreas: parsed.diffAreas ?? [],
    causeRuleIds: parsed.causeRuleIds ?? [],
  };
}

/**
 * Run visual comparison for a batch of nodes
 */
export async function runVisualComparison(
  inputs: VisualComparisonInput[],
  options?: { deepCompare?: boolean; anthropicApiKey?: string; threshold?: number }
): Promise<VisualComparisonRecord[]> {
  const records: VisualComparisonRecord[] = [];

  for (const input of inputs) {
    const pixelComparison = compareImages(
      input.figmaScreenshotBase64,
      input.renderedScreenshotBase64,
      options?.threshold !== undefined ? { threshold: options.threshold } : undefined
    );

    let deepComparison: DeepComparisonResult | undefined;
    if (options?.deepCompare && options.anthropicApiKey) {
      try {
        deepComparison = await deepCompareImages(
          input.figmaScreenshotBase64,
          input.renderedScreenshotBase64,
          options.anthropicApiKey
        );
      } catch {
        // Deep comparison failure is non-fatal
      }
    }

    const record: VisualComparisonRecord = {
      nodeId: input.nodeId,
      nodePath: input.nodePath,
      figmaScreenshotBase64: input.figmaScreenshotBase64,
      renderedScreenshotBase64: input.renderedScreenshotBase64,
      pixelComparison,
    };

    if (deepComparison) {
      record.deepComparison = deepComparison;
    }

    records.push(record);
  }

  return records;
}
