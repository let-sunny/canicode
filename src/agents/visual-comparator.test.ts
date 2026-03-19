import { PNG } from "pngjs";

import { compareImages, deepCompareImages, runVisualComparison } from "./visual-comparator.js";
import type { VisualComparisonInput } from "./contracts/visual-comparison.js";

function createTestPng(width: number, height: number, r: number, g: number, b: number): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString("base64");
}

describe("compareImages", () => {
  it("returns 0% diff and sizeMatch true for identical images", () => {
    const imageA = createTestPng(2, 2, 255, 0, 0);
    const imageB = createTestPng(2, 2, 255, 0, 0);

    const result = compareImages(imageA, imageB);

    expect(result.pixelDiffPercentage).toBe(0);
    expect(result.sizeMatch).toBe(true);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.totalPixels).toBe(4);
    expect(result.diffPixels).toBe(0);
    expect(result.diffImageBase64).not.toBe("");
  });

  it("returns high diff percentage for completely different images", () => {
    const imageA = createTestPng(2, 2, 255, 0, 0);
    const imageB = createTestPng(2, 2, 0, 0, 255);

    const result = compareImages(imageA, imageB);

    expect(result.pixelDiffPercentage).toBeGreaterThan(0);
    expect(result.sizeMatch).toBe(true);
    expect(result.diffPixels).toBeGreaterThan(0);
    expect(result.totalPixels).toBe(4);
    expect(result.diffImageBase64).not.toBe("");
  });

  it("returns 100% diff and sizeMatch false for different-sized images", () => {
    const imageA = createTestPng(2, 2, 255, 0, 0);
    const imageB = createTestPng(3, 4, 255, 0, 0);

    const result = compareImages(imageA, imageB);

    expect(result.pixelDiffPercentage).toBe(100);
    expect(result.sizeMatch).toBe(false);
    expect(result.diffImageBase64).toBe("");
    expect(result.width).toBe(3);
    expect(result.height).toBe(4);
    expect(result.totalPixels).toBe(12);
    expect(result.diffPixels).toBe(12);
  });
});

describe("runVisualComparison", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("processes multiple inputs and returns correct records", async () => {
    const redImage = createTestPng(2, 2, 255, 0, 0);
    const blueImage = createTestPng(2, 2, 0, 0, 255);

    const inputs: VisualComparisonInput[] = [
      {
        nodeId: "node-1",
        nodePath: "Page > Frame A",
        figmaScreenshotBase64: redImage,
        renderedScreenshotBase64: redImage,
      },
      {
        nodeId: "node-2",
        nodePath: "Page > Frame B",
        figmaScreenshotBase64: redImage,
        renderedScreenshotBase64: blueImage,
      },
    ];

    const records = await runVisualComparison(inputs);

    expect(records).toHaveLength(2);

    expect(records[0]!.nodeId).toBe("node-1");
    expect(records[0]!.nodePath).toBe("Page > Frame A");
    expect(records[0]!.pixelComparison.pixelDiffPercentage).toBe(0);
    expect(records[0]!.pixelComparison.sizeMatch).toBe(true);
    expect(records[0]!.deepComparison).toBeUndefined();

    expect(records[1]!.nodeId).toBe("node-2");
    expect(records[1]!.nodePath).toBe("Page > Frame B");
    expect(records[1]!.pixelComparison.pixelDiffPercentage).toBeGreaterThan(0);
    expect(records[1]!.pixelComparison.sizeMatch).toBe(true);
    expect(records[1]!.deepComparison).toBeUndefined();
  });

  it("does not include deepComparison when deepCompare is not set", async () => {
    const image = createTestPng(2, 2, 128, 128, 128);

    const inputs: VisualComparisonInput[] = [
      {
        nodeId: "node-1",
        nodePath: "Page > Frame",
        figmaScreenshotBase64: image,
        renderedScreenshotBase64: image,
      },
    ];

    const records = await runVisualComparison(inputs);

    expect(records).toHaveLength(1);
    expect(records[0]!.deepComparison).toBeUndefined();
  });
});

describe("deepCompareImages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the Anthropic API and parses the response", async () => {
    const deepComparisonResult = {
      similarityScore: 85,
      diffAreas: ["color diff"],
      causeRuleIds: ["raw-color"],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [
          { type: "text", text: JSON.stringify(deepComparisonResult) },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const figmaImage = createTestPng(2, 2, 255, 0, 0);
    const renderedImage = createTestPng(2, 2, 0, 0, 255);

    const result = await deepCompareImages(figmaImage, renderedImage, "test-api-key");

    expect(result.similarityScore).toBe(85);
    expect(result.diffAreas).toEqual(["color diff"]);
    expect(result.causeRuleIds).toEqual(["raw-color"]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["x-api-key"]).toBe("test-api-key");
  });

  it("throws on non-ok API response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const image = createTestPng(2, 2, 0, 0, 0);

    await expect(
      deepCompareImages(image, image, "bad-key")
    ).rejects.toThrow("Anthropic API error (401): Unauthorized");
  });
});
