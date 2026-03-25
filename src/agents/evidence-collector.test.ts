import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadCalibrationEvidence,
  appendCalibrationEvidence,
  pruneCalibrationEvidence,
  loadDiscoveryEvidence,
  appendDiscoveryEvidence,
  pruneDiscoveryEvidence,
  loadElasticityEvidence,
  appendElasticityEvidence,
  pruneElasticityEvidence,
  aggregateElasticity,
} from "./evidence-collector.js";
import type {
  CalibrationEvidenceEntry,
  DiscoveryEvidenceEntry,
  ElasticityEvidenceEntry,
} from "./evidence-collector.js";

describe("evidence-collector", () => {
  const tmpDir = join(tmpdir(), "canicode-evidence-test");
  const calPath = join(tmpDir, "calibration-evidence.json");
  const disPath = join(tmpDir, "discovery-evidence.json");

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // --- Calibration evidence ---

  describe("loadCalibrationEvidence", () => {
    it("returns empty object when file does not exist", () => {
      const result = loadCalibrationEvidence(calPath);
      expect(result).toEqual({});
    });

    it("returns empty object for empty array", () => {
      writeFileSync(calPath, "[]", "utf-8");
      const result = loadCalibrationEvidence(calPath);
      expect(result).toEqual({});
    });

    it("groups entries by ruleId correctly", () => {
      const entries: CalibrationEvidenceEntry[] = [
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "moderate", fixture: "fx2", timestamp: "t2" },
        { ruleId: "rule-a", type: "underscored", actualDifficulty: "hard", fixture: "fx3", timestamp: "t3" },
        { ruleId: "rule-b", type: "underscored", actualDifficulty: "hard", fixture: "fx1", timestamp: "t1" },
      ];
      writeFileSync(calPath, JSON.stringify(entries), "utf-8");

      const result = loadCalibrationEvidence(calPath);

      expect(result["rule-a"]).toEqual({
        overscoredCount: 2,
        underscoredCount: 1,
        overscoredDifficulties: ["easy", "moderate"],
        underscoredDifficulties: ["hard"],
      });
      expect(result["rule-b"]).toEqual({
        overscoredCount: 0,
        underscoredCount: 1,
        overscoredDifficulties: [],
        underscoredDifficulties: ["hard"],
      });
    });

    it("handles malformed JSON gracefully", () => {
      writeFileSync(calPath, "not json", "utf-8");
      const result = loadCalibrationEvidence(calPath);
      expect(result).toEqual({});
    });
  });

  describe("appendCalibrationEvidence", () => {
    it("creates file and appends entries", () => {
      const entries: CalibrationEvidenceEntry[] = [
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
      ];
      appendCalibrationEvidence(entries, calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.ruleId).toBe("rule-a");
    });

    it("appends to existing entries", () => {
      writeFileSync(calPath, JSON.stringify([
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
      ]), "utf-8");

      appendCalibrationEvidence([
        { ruleId: "rule-b", type: "underscored", actualDifficulty: "hard", fixture: "fx2", timestamp: "t2" },
      ], calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(2);
    });

    it("replaces prior entry for same ruleId and fixture (latest run wins)", () => {
      writeFileSync(calPath, JSON.stringify([
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
      ]), "utf-8");

      appendCalibrationEvidence([
        { ruleId: "rule-a", type: "underscored", actualDifficulty: "hard", fixture: "fx1", timestamp: "t2" },
      ], calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.type).toBe("underscored");
    });

    it("dedupes within a single append call (last row for same ruleId and fixture wins)", () => {
      appendCalibrationEvidence([
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
        { ruleId: "rule-a", type: "underscored", actualDifficulty: "hard", fixture: "fx1", timestamp: "t2" },
      ], calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.type).toBe("underscored");
    });

    it("does nothing for empty entries", () => {
      writeFileSync(calPath, "[]", "utf-8");
      appendCalibrationEvidence([], calPath);
      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(0);
    });
  });

  describe("pruneCalibrationEvidence", () => {
    it("removes entries for specified ruleIds", () => {
      const entries: CalibrationEvidenceEntry[] = [
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx2", timestamp: "t2" },
        { ruleId: "rule-b", type: "underscored", actualDifficulty: "hard", fixture: "fx1", timestamp: "t1" },
      ];
      writeFileSync(calPath, JSON.stringify(entries), "utf-8");

      pruneCalibrationEvidence(["rule-a"], calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.ruleId).toBe("rule-b");
    });

    it("trims ruleIds when matching stored entries", () => {
      writeFileSync(calPath, JSON.stringify([
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
      ]), "utf-8");

      pruneCalibrationEvidence(["  rule-a  "], calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(0);
    });

    it("does nothing for empty ruleIds", () => {
      const entries: CalibrationEvidenceEntry[] = [
        { ruleId: "rule-a", type: "overscored", actualDifficulty: "easy", fixture: "fx1", timestamp: "t1" },
      ];
      writeFileSync(calPath, JSON.stringify(entries), "utf-8");

      pruneCalibrationEvidence([], calPath);

      const raw = JSON.parse(readFileSync(calPath, "utf-8")) as CalibrationEvidenceEntry[];
      expect(raw).toHaveLength(1);
    });

    it("handles missing file gracefully", () => {
      expect(() => pruneCalibrationEvidence(["rule-a"], calPath)).not.toThrow();
    });
  });

  // --- Discovery evidence ---

  describe("loadDiscoveryEvidence", () => {
    it("returns empty array when file does not exist", () => {
      const result = loadDiscoveryEvidence(disPath);
      expect(result).toEqual([]);
    });

    it("returns entries from file", () => {
      const entries: DiscoveryEvidenceEntry[] = [
        { description: "gap1", category: "layout", impact: "hard", fixture: "fx1", timestamp: "t1", source: "evaluation" },
      ];
      writeFileSync(disPath, JSON.stringify(entries), "utf-8");

      const result = loadDiscoveryEvidence(disPath);
      expect(result).toHaveLength(1);
      expect(result[0]!.category).toBe("layout");
    });
  });

  describe("appendDiscoveryEvidence", () => {
    it("creates file and appends entries", () => {
      appendDiscoveryEvidence([
        { description: "gap1", category: "layout", impact: "hard", fixture: "fx1", timestamp: "t1", source: "gap-analysis" },
      ], disPath);

      const raw = JSON.parse(readFileSync(disPath, "utf-8")) as DiscoveryEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.source).toBe("gap-analysis");
    });

    it("appends to existing entries", () => {
      writeFileSync(disPath, JSON.stringify([
        { description: "gap1", category: "layout", impact: "hard", fixture: "fx1", timestamp: "t1", source: "evaluation" },
      ]), "utf-8");

      appendDiscoveryEvidence([
        { description: "gap2", category: "color", impact: "moderate", fixture: "fx2", timestamp: "t2", source: "gap-analysis" },
      ], disPath);

      const raw = JSON.parse(readFileSync(disPath, "utf-8")) as DiscoveryEvidenceEntry[];
      expect(raw).toHaveLength(2);
    });
  });

  describe("pruneDiscoveryEvidence", () => {
    it("removes entries for specified categories (case-insensitive)", () => {
      const entries: DiscoveryEvidenceEntry[] = [
        { description: "gap1", category: "Layout", impact: "hard", fixture: "fx1", timestamp: "t1", source: "evaluation" },
        { description: "gap2", category: "layout", impact: "hard", fixture: "fx2", timestamp: "t2", source: "gap-analysis" },
        { description: "gap3", category: "color", impact: "moderate", fixture: "fx1", timestamp: "t1", source: "evaluation" },
      ];
      writeFileSync(disPath, JSON.stringify(entries), "utf-8");

      pruneDiscoveryEvidence(["layout"], disPath);

      const raw = JSON.parse(readFileSync(disPath, "utf-8")) as DiscoveryEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.category).toBe("color");
    });

    it("does nothing for empty categories", () => {
      const entries: DiscoveryEvidenceEntry[] = [
        { description: "gap1", category: "layout", impact: "hard", fixture: "fx1", timestamp: "t1", source: "evaluation" },
      ];
      writeFileSync(disPath, JSON.stringify(entries), "utf-8");

      pruneDiscoveryEvidence([], disPath);

      const raw = JSON.parse(readFileSync(disPath, "utf-8")) as DiscoveryEvidenceEntry[];
      expect(raw).toHaveLength(1);
    });
  });

  // --- Elasticity evidence ---

  const elaPath = join(tmpDir, "elasticity-evidence.json");

  describe("loadElasticityEvidence", () => {
    it("returns empty array when file does not exist", () => {
      expect(loadElasticityEvidence(elaPath)).toEqual([]);
    });

    it("returns entries from file", () => {
      const entries: ElasticityEvidenceEntry[] = [
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 85, similarityWithout: 78, delta: 7, timestamp: "t1" },
      ];
      writeFileSync(elaPath, JSON.stringify(entries), "utf-8");
      const result = loadElasticityEvidence(elaPath);
      expect(result).toHaveLength(1);
      expect(result[0]!.delta).toBe(7);
    });
  });

  describe("appendElasticityEvidence", () => {
    it("creates file and appends entries", () => {
      appendElasticityEvidence([
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 85, similarityWithout: 78, delta: 7, timestamp: "t1" },
      ], elaPath);

      const raw = JSON.parse(readFileSync(elaPath, "utf-8")) as ElasticityEvidenceEntry[];
      expect(raw).toHaveLength(1);
    });

    it("deduplicates by ruleId + fixture (latest wins)", () => {
      writeFileSync(elaPath, JSON.stringify([
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 85, similarityWithout: 78, delta: 7, timestamp: "t1" },
      ]), "utf-8");

      appendElasticityEvidence([
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 90, similarityWithout: 80, delta: 10, timestamp: "t2" },
      ], elaPath);

      const raw = JSON.parse(readFileSync(elaPath, "utf-8")) as ElasticityEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.delta).toBe(10);
    });

    it("keeps different fixtures separate", () => {
      appendElasticityEvidence([
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 85, similarityWithout: 78, delta: 7, timestamp: "t1" },
        { ruleId: "rule-a", fixture: "fx2", similarityWith: 90, similarityWithout: 82, delta: 8, timestamp: "t1" },
      ], elaPath);

      const raw = JSON.parse(readFileSync(elaPath, "utf-8")) as ElasticityEvidenceEntry[];
      expect(raw).toHaveLength(2);
    });
  });

  describe("pruneElasticityEvidence", () => {
    it("removes entries for specified ruleIds", () => {
      const entries: ElasticityEvidenceEntry[] = [
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 85, similarityWithout: 78, delta: 7, timestamp: "t1" },
        { ruleId: "rule-b", fixture: "fx1", similarityWith: 90, similarityWithout: 85, delta: 5, timestamp: "t1" },
      ];
      writeFileSync(elaPath, JSON.stringify(entries), "utf-8");

      pruneElasticityEvidence(["rule-a"], elaPath);

      const raw = JSON.parse(readFileSync(elaPath, "utf-8")) as ElasticityEvidenceEntry[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.ruleId).toBe("rule-b");
    });
  });

  describe("aggregateElasticity", () => {
    it("computes per-rule profiles with correct stats", () => {
      const entries: ElasticityEvidenceEntry[] = [
        { ruleId: "rule-a", fixture: "fx1", similarityWith: 85, similarityWithout: 78, delta: 7, timestamp: "t1" },
        { ruleId: "rule-a", fixture: "fx2", similarityWith: 90, similarityWithout: 87, delta: 3, timestamp: "t2" },
        { ruleId: "rule-a", fixture: "fx3", similarityWith: 80, similarityWithout: 75, delta: 5, timestamp: "t3" },
        { ruleId: "rule-b", fixture: "fx1", similarityWith: 70, similarityWithout: 72, delta: -2, timestamp: "t1" },
      ];

      const profiles = aggregateElasticity(entries);
      expect(profiles).toHaveLength(2);

      const ruleA = profiles.find((p) => p.ruleId === "rule-a");
      expect(ruleA).toBeDefined();
      expect(ruleA!.measurements).toBe(3);
      expect(ruleA!.meanDelta).toBe(5);
      expect(ruleA!.minDelta).toBe(3);
      expect(ruleA!.maxDelta).toBe(7);
      expect(ruleA!.confidence).toBe("high");
      expect(ruleA!.fixtures).toEqual(["fx1", "fx2", "fx3"]);

      const ruleB = profiles.find((p) => p.ruleId === "rule-b");
      expect(ruleB).toBeDefined();
      expect(ruleB!.measurements).toBe(1);
      expect(ruleB!.meanDelta).toBe(-2);
      expect(ruleB!.confidence).toBe("low");
    });

    it("returns empty array for empty input", () => {
      expect(aggregateElasticity([])).toEqual([]);
    });

    it("sorts profiles by meanDelta descending", () => {
      const entries: ElasticityEvidenceEntry[] = [
        { ruleId: "low", fixture: "fx1", similarityWith: 80, similarityWithout: 79, delta: 1, timestamp: "t1" },
        { ruleId: "high", fixture: "fx1", similarityWith: 90, similarityWithout: 80, delta: 10, timestamp: "t1" },
      ];

      const profiles = aggregateElasticity(entries);
      expect(profiles[0]!.ruleId).toBe("high");
      expect(profiles[1]!.ruleId).toBe("low");
    });
  });
});
