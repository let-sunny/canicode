import type {
  ConversionAgentInput,
  ConversionAgentOutput,
  ConversionExecutor,
  ConversionRecord,
} from "./contracts/conversion-agent.js";

/**
 * Conversion Agent - Step 2 of calibration pipeline
 *
 * Attempts code conversion for each node via an injected executor.
 * Uses dependency inversion: the executor handles actual LLM/MCP calls.
 * Failures on individual nodes are captured, not thrown.
 */
export async function runConversionAgent(
  input: ConversionAgentInput,
  executor: ConversionExecutor
): Promise<ConversionAgentOutput> {
  const records: ConversionRecord[] = [];
  const skippedNodeIds: string[] = [];

  for (const node of input.nodes) {
    const startTime = Date.now();

    try {
      const result = await executor(
        node.nodeId,
        input.fileKey,
        node.flaggedRuleIds
      );

      const durationMs = Date.now() - startTime;

      records.push({
        nodeId: node.nodeId,
        nodePath: node.nodePath,
        generatedCode: result.generatedCode,
        difficulty: result.difficulty,
        notes: result.notes,
        ruleRelatedStruggles: result.ruleRelatedStruggles,
        uncoveredStruggles: result.uncoveredStruggles,
        durationMs,
      });
    } catch {
      skippedNodeIds.push(node.nodeId);
    }
  }

  return { records, skippedNodeIds };
}
