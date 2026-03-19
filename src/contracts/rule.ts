import { z } from "zod";
import { CategorySchema } from "./category.js";
import { SeveritySchema } from "./severity.js";

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: CategorySchema,
  severity: SeveritySchema,
  enabled: z.boolean().default(true),
});

export type Rule = z.infer<typeof RuleSchema>;

export const RuleConfigSchema = z.object({
  enabled: z.boolean().optional(),
  severity: SeveritySchema.optional(),
});

export type RuleConfig = z.infer<typeof RuleConfigSchema>;
