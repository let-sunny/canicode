import type { Category } from "../contracts/category.js";
import { CATEGORIES } from "../contracts/category.js";
import type { Severity } from "../contracts/severity.js";
import type { AnalysisResult } from "./rule-engine.js";

/**
 * Score breakdown for a single category
 */
export interface CategoryScoreResult {
  category: Category;
  score: number;
  maxScore: number;
  percentage: number;
  issueCount: number;
  weightedIssueCount: number;
  bySeverity: Record<Severity, number>;
}

/**
 * Overall score report
 */
export interface ScoreReport {
  overall: {
    score: number;
    maxScore: number;
    percentage: number;
    grade: Grade;
  };
  byCategory: Record<Category, CategoryScoreResult>;
  summary: {
    totalIssues: number;
    blocking: number;
    risk: number;
    missingInfo: number;
    suggestion: number;
    nodeCount: number;
  };
}

/**
 * Grade levels based on percentage
 */
export type Grade = "A" | "B" | "C" | "D" | "F";

/**
 * Severity weights for density calculation
 */
const SEVERITY_DENSITY_WEIGHT: Record<Severity, number> = {
  blocking: 3.0,
  risk: 2.0,
  "missing-info": 1.0,
  suggestion: 0.5,
};

/**
 * Category weights for overall score (all equal by default)
 */
const CATEGORY_WEIGHT: Record<Category, number> = {
  layout: 1.0,
  token: 1.0,
  component: 1.0,
  naming: 1.0,
  "ai-readability": 1.0,
  "handoff-risk": 1.0,
};

/**
 * Calculate grade from percentage
 */
function calculateGrade(percentage: number): Grade {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate scores from analysis result using density-based scoring
 *
 * Category Score = 100 - (weighted issue count / node count) * 100
 * Weighted issue count = sum of (severity weight) for each issue
 */
export function calculateScores(result: AnalysisResult): ScoreReport {
  const categoryScores = initializeCategoryScores();
  const nodeCount = result.nodeCount;

  // Count issues by severity per category
  for (const issue of result.issues) {
    const category = issue.rule.definition.category;
    const severity = issue.config.severity;

    categoryScores[category].issueCount++;
    categoryScores[category].bySeverity[severity]++;
    categoryScores[category].weightedIssueCount += SEVERITY_DENSITY_WEIGHT[severity];
  }

  // Calculate percentage for each category based on density
  for (const category of CATEGORIES) {
    const catScore = categoryScores[category];

    if (nodeCount > 0) {
      // Density = weighted issues / nodes
      // Score = 100 - (density * 100), clamped to 0-100
      const density = catScore.weightedIssueCount / nodeCount;
      catScore.percentage = clamp(Math.round(100 - density * 100), 0, 100);
    } else {
      catScore.percentage = 100; // No nodes = perfect score
    }

    catScore.score = catScore.percentage;
    catScore.maxScore = 100;
  }

  // Calculate overall score as weighted average of categories
  let totalWeight = 0;
  let weightedSum = 0;

  for (const category of CATEGORIES) {
    const weight = CATEGORY_WEIGHT[category];
    weightedSum += categoryScores[category].percentage * weight;
    totalWeight += weight;
  }

  const overallPercentage = totalWeight > 0
    ? Math.round(weightedSum / totalWeight)
    : 100;

  // Count issues by severity
  const summary = {
    totalIssues: result.issues.length,
    blocking: 0,
    risk: 0,
    missingInfo: 0,
    suggestion: 0,
    nodeCount,
  };

  for (const issue of result.issues) {
    switch (issue.config.severity) {
      case "blocking":
        summary.blocking++;
        break;
      case "risk":
        summary.risk++;
        break;
      case "missing-info":
        summary.missingInfo++;
        break;
      case "suggestion":
        summary.suggestion++;
        break;
    }
  }

  return {
    overall: {
      score: overallPercentage,
      maxScore: 100,
      percentage: overallPercentage,
      grade: calculateGrade(overallPercentage),
    },
    byCategory: categoryScores,
    summary,
  };
}

/**
 * Initialize empty category scores
 */
function initializeCategoryScores(): Record<Category, CategoryScoreResult> {
  const scores: Partial<Record<Category, CategoryScoreResult>> = {};

  for (const category of CATEGORIES) {
    scores[category] = {
      category,
      score: 100,
      maxScore: 100,
      percentage: 100,
      issueCount: 0,
      weightedIssueCount: 0,
      bySeverity: {
        blocking: 0,
        risk: 0,
        "missing-info": 0,
        suggestion: 0,
      },
    };
  }

  return scores as Record<Category, CategoryScoreResult>;
}

/**
 * Format score report as a summary string
 */
export function formatScoreSummary(report: ScoreReport): string {
  const lines: string[] = [];

  lines.push(`Overall: ${report.overall.grade} (${report.overall.percentage}%)`);
  lines.push("");
  lines.push("By Category:");

  for (const category of CATEGORIES) {
    const cat = report.byCategory[category];
    lines.push(`  ${category}: ${cat.percentage}% (${cat.issueCount} issues)`);
  }

  lines.push("");
  lines.push("Issues:");
  lines.push(`  Blocking: ${report.summary.blocking}`);
  lines.push(`  Risk: ${report.summary.risk}`);
  lines.push(`  Missing Info: ${report.summary.missingInfo}`);
  lines.push(`  Suggestion: ${report.summary.suggestion}`);
  lines.push(`  Total: ${report.summary.totalIssues}`);

  return lines.join("\n");
}

/**
 * Get category label for display
 */
export function getCategoryLabel(category: Category): string {
  const labels: Record<Category, string> = {
    layout: "Layout",
    token: "Design Token",
    component: "Component",
    naming: "Naming",
    "ai-readability": "AI Readability",
    "handoff-risk": "Handoff Risk",
  };
  return labels[category];
}

/**
 * Get severity label for display
 */
export function getSeverityLabel(severity: Severity): string {
  const labels: Record<Severity, string> = {
    blocking: "Blocking",
    risk: "Risk",
    "missing-info": "Missing Info",
    suggestion: "Suggestion",
  };
  return labels[severity];
}
