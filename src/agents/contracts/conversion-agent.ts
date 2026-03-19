import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "moderate", "hard", "failed"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const RuleRelatedStruggleSchema = z.object({
  ruleId: z.string(),
  description: z.string(),
  actualImpact: DifficultySchema,
});

export type RuleRelatedStruggle = z.infer<typeof RuleRelatedStruggleSchema>;

export const UncoveredStruggleSchema = z.object({
  description: z.string(),
  suggestedCategory: z.string(),
  estimatedImpact: DifficultySchema,
});

export type UncoveredStruggle = z.infer<typeof UncoveredStruggleSchema>;

export const ConversionRecordSchema = z.object({
  nodeId: z.string(),
  nodePath: z.string(),
  generatedCode: z.string(),
  difficulty: DifficultySchema,
  notes: z.string(),
  ruleRelatedStruggles: z.array(RuleRelatedStruggleSchema),
  uncoveredStruggles: z.array(UncoveredStruggleSchema),
  durationMs: z.number(),
});

export type ConversionRecord = z.infer<typeof ConversionRecordSchema>;

export interface ConversionExecutorResult {
  generatedCode: string;
  difficulty: Difficulty;
  notes: string;
  ruleRelatedStruggles: RuleRelatedStruggle[];
  uncoveredStruggles: UncoveredStruggle[];
}

export type ConversionExecutor = (
  nodeId: string,
  fileKey: string,
  flaggedRuleIds: string[]
) => Promise<ConversionExecutorResult>;

export interface ConversionAgentInput {
  fileKey: string;
  nodes: Array<{
    nodeId: string;
    nodePath: string;
    flaggedRuleIds: string[];
  }>;
}

export interface ConversionAgentOutput {
  records: ConversionRecord[];
  skippedNodeIds: string[];
}
