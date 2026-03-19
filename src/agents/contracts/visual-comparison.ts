import { z } from "zod";

export const PixelComparisonResultSchema = z.object({
  pixelDiffPercentage: z.number(),
  diffImageBase64: z.string(),
  width: z.number(),
  height: z.number(),
  totalPixels: z.number(),
  diffPixels: z.number(),
  sizeMatch: z.boolean(),
});

export type PixelComparisonResult = z.infer<typeof PixelComparisonResultSchema>;

export const DeepComparisonResultSchema = z.object({
  similarityScore: z.number().min(0).max(100),
  diffAreas: z.array(z.string()),
  causeRuleIds: z.array(z.string()),
});

export type DeepComparisonResult = z.infer<typeof DeepComparisonResultSchema>;

export const VisualComparisonRecordSchema = z.object({
  nodeId: z.string(),
  nodePath: z.string(),
  figmaScreenshotBase64: z.string(),
  renderedScreenshotBase64: z.string(),
  pixelComparison: PixelComparisonResultSchema,
  deepComparison: DeepComparisonResultSchema.optional(),
});

export type VisualComparisonRecord = z.infer<typeof VisualComparisonRecordSchema>;

export interface VisualComparisonInput {
  nodeId: string;
  nodePath: string;
  figmaScreenshotBase64: string;
  renderedScreenshotBase64: string;
}

export type VisualDataProvider = (
  nodeId: string,
  fileKey: string
) => Promise<{
  figmaScreenshotBase64: string;
  renderedScreenshotBase64: string;
}>;
