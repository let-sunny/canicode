/**
 * Prompt template for the conversion executor.
 *
 * The executor (typically an LLM session with Figma MCP access) receives
 * this prompt to guide code generation and difficulty assessment.
 */

export function buildConversionPrompt(
  nodeId: string,
  fileKey: string,
  flaggedRuleIds: string[]
): string {
  const ruleList =
    flaggedRuleIds.length > 0
      ? flaggedRuleIds.map((id) => `- ${id}`).join("\n")
      : "- (none)";

  return `You are a frontend developer converting a Figma design node to production-ready CSS/HTML/React code.

## Task

Convert the Figma node to code, then assess the conversion difficulty.

## Node Information
- **File Key**: ${fileKey}
- **Node ID**: ${nodeId}

Use \`get_design_context\` to fetch the node's design details before attempting conversion.

## Flagged Design Issues

The following rules were flagged by the design readiness checker for this node:
${ruleList}

## Instructions

1. Fetch the node's design context using MCP
2. Attempt to convert it to production-ready CSS + HTML (or React component)
3. For each flagged rule, note whether it actually made conversion harder
4. Note any conversion difficulties NOT covered by the flagged rules

## Output Format

Respond with a JSON object matching this structure:

\`\`\`json
{
  "generatedCode": "// The generated CSS/HTML/React code",
  "difficulty": "easy | moderate | hard | failed",
  "notes": "Brief summary of the conversion experience",
  "ruleRelatedStruggles": [
    {
      "ruleId": "rule-id",
      "description": "How this rule's issue affected conversion",
      "actualImpact": "easy | moderate | hard | failed"
    }
  ],
  "uncoveredStruggles": [
    {
      "description": "A difficulty not covered by any flagged rule",
      "suggestedCategory": "layout | token | component | naming | ai-readability | handoff-risk",
      "estimatedImpact": "easy | moderate | hard | failed"
    }
  ]
}
\`\`\`

## Difficulty Guidelines

- **easy**: Straightforward conversion, no guessing needed
- **moderate**: Some ambiguity or manual adjustment required
- **hard**: Significant guessing, multiple approaches needed, fragile output
- **failed**: Could not produce usable code from the design
`;
}
