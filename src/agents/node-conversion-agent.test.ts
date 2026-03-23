import type {
  ConversionAgentInput,
  ConversionExecutor,
  ConversionExecutorResult,
} from "./contracts/conversion-agent.js";
import { runConversionAgent } from "./node-conversion-agent.js";

function makeExecutorResult(
  overrides: Partial<ConversionExecutorResult> = {}
): ConversionExecutorResult {
  return {
    generatedCode: "<div>hello</div>",
    difficulty: "easy",
    notes: "straightforward conversion",
    ruleRelatedStruggles: [],
    uncoveredStruggles: [],
    ...overrides,
  };
}

function makeInput(
  nodeCount: number,
  fileKey = "file-abc"
): ConversionAgentInput {
  return {
    fileKey,
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      nodeId: `node-${i}`,
      nodePath: `Page > Frame > Node${i}`,
      flaggedRuleIds: [`rule-${i}`],
    })),
  };
}

describe("runConversionAgent", () => {
  it("converts all nodes successfully and populates record fields", async () => {
    const input = makeInput(2);

    const result0 = makeExecutorResult({
      generatedCode: "<div>node-0</div>",
      difficulty: "easy",
      notes: "no issues",
      ruleRelatedStruggles: [
        { ruleId: "rule-0", description: "minor gap", actualImpact: "easy" },
      ],
      uncoveredStruggles: [
        {
          description: "unknown pattern",
          suggestedCategory: "layout",
          estimatedImpact: "moderate",
        },
      ],
    });

    const result1 = makeExecutorResult({
      generatedCode: "<span>node-1</span>",
      difficulty: "hard",
      notes: "complex layout",
    });

    const executor: ConversionExecutor = vi
      .fn<ConversionExecutor>()
      .mockResolvedValueOnce(result0)
      .mockResolvedValueOnce(result1);

    const output = await runConversionAgent(input, executor);

    expect(output.skippedNodeIds).toEqual([]);
    expect(output.records).toHaveLength(2);

    const rec0 = output.records[0]!;
    expect(rec0.nodeId).toBe("node-0");
    expect(rec0.nodePath).toBe("Page > Frame > Node0");
    expect(rec0.generatedCode).toBe("<div>node-0</div>");
    expect(rec0.difficulty).toBe("easy");
    expect(rec0.notes).toBe("no issues");
    expect(rec0.ruleRelatedStruggles).toEqual(result0.ruleRelatedStruggles);
    expect(rec0.uncoveredStruggles).toEqual(result0.uncoveredStruggles);

    const rec1 = output.records[1]!;
    expect(rec1.nodeId).toBe("node-1");
    expect(rec1.difficulty).toBe("hard");
    expect(rec1.generatedCode).toBe("<span>node-1</span>");

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenCalledWith("node-0", "file-abc", ["rule-0"]);
    expect(executor).toHaveBeenCalledWith("node-1", "file-abc", ["rule-1"]);
  });

  it("skips nodes whose executor throws and still processes the rest", async () => {
    const input = makeInput(3);

    const executor: ConversionExecutor = vi
      .fn<ConversionExecutor>()
      .mockResolvedValueOnce(makeExecutorResult())
      .mockRejectedValueOnce(new Error("LLM timeout"))
      .mockResolvedValueOnce(
        makeExecutorResult({ generatedCode: "<p>recovered</p>" })
      );

    const output = await runConversionAgent(input, executor);

    expect(output.records).toHaveLength(2);
    expect(output.records.map((r) => r.nodeId)).toEqual(["node-0", "node-2"]);

    expect(output.skippedNodeIds).toEqual(["node-1"]);
  });

  it("returns all nodes in skippedNodeIds when every executor call fails", async () => {
    const input = makeInput(3);

    const executor: ConversionExecutor = vi
      .fn<ConversionExecutor>()
      .mockRejectedValue(new Error("service down"));

    const output = await runConversionAgent(input, executor);

    expect(output.records).toEqual([]);
    expect(output.skippedNodeIds).toEqual(["node-0", "node-1", "node-2"]);
  });

  it("records durationMs greater than zero for each conversion", async () => {
    const input = makeInput(1);

    const executor: ConversionExecutor = vi
      .fn<ConversionExecutor>()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(makeExecutorResult()), 10)
          )
      );

    const output = await runConversionAgent(input, executor);

    expect(output.records).toHaveLength(1);
    expect(output.records[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty records and skippedNodeIds when input has no nodes", async () => {
    const input: ConversionAgentInput = { fileKey: "file-empty", nodes: [] };
    const executor: ConversionExecutor = vi.fn<ConversionExecutor>();

    const output = await runConversionAgent(input, executor);

    expect(output.records).toEqual([]);
    expect(output.skippedNodeIds).toEqual([]);
    expect(executor).not.toHaveBeenCalled();
  });
});
