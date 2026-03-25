import { z } from "zod";

// --- Calibration evidence ---

export const CalibrationEvidenceEntrySchema = z.object({
  ruleId: z.string(),
  type: z.enum(["overscored", "underscored"]),
  actualDifficulty: z.string(),
  fixture: z.string(),
  timestamp: z.string(),
});

export type CalibrationEvidenceEntry = z.infer<typeof CalibrationEvidenceEntrySchema>;

export const CrossRunEvidenceGroupSchema = z.object({
  overscoredCount: z.number(),
  underscoredCount: z.number(),
  overscoredDifficulties: z.array(z.string()),
  underscoredDifficulties: z.array(z.string()),
});

export type CrossRunEvidenceGroup = z.infer<typeof CrossRunEvidenceGroupSchema>;

export type CrossRunEvidence = Record<string, CrossRunEvidenceGroup>;

// --- Discovery evidence ---

export const DiscoveryEvidenceEntrySchema = z.object({
  description: z.string(),
  category: z.string(),
  impact: z.string(),
  fixture: z.string(),
  timestamp: z.string(),
  source: z.enum(["evaluation", "gap-analysis"]),
});

export type DiscoveryEvidenceEntry = z.infer<typeof DiscoveryEvidenceEntrySchema>;

// --- Elasticity evidence ---

export const ElasticityEvidenceEntrySchema = z.object({
  ruleId: z.string(),
  fixture: z.string(),
  similarityWith: z.number().min(0).max(100),
  similarityWithout: z.number().min(0).max(100),
  delta: z.number(),
  timestamp: z.string(),
});

export type ElasticityEvidenceEntry = z.infer<typeof ElasticityEvidenceEntrySchema>;

export const ElasticityProfileSchema = z.object({
  ruleId: z.string(),
  measurements: z.number().int().min(0),
  meanDelta: z.number(),
  minDelta: z.number(),
  maxDelta: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  fixtures: z.array(z.string()),
});

export type ElasticityProfile = z.infer<typeof ElasticityProfileSchema>;
