import { z } from "zod";

/** Zod schema for CLI visual-compare options (raw CLI input). */
export const VisualCompareCliOptionsSchema = z.object({
  figmaUrl: z.string().optional(),
  figmaScreenshot: z.string().optional(),
  token: z.string().optional(),
  output: z.string().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  figmaScale: z.string().optional(),
  expandRoot: z.boolean().optional(),
});

export type VisualCompareCliOptions = z.infer<typeof VisualCompareCliOptionsSchema>;
