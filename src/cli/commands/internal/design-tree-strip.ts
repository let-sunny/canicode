import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { CAC } from "cac";

import { stripDesignTree, DESIGN_TREE_INFO_TYPES } from "../../../core/design-tree/strip.js";
import type { DesignTreeInfoType } from "../../../core/design-tree/strip.js";

export function registerDesignTreeStrip(cli: CAC): void {
  cli
    .command(
      "design-tree-strip <input>",
      "[internal] Generate stripped design-tree variants for ablation"
    )
    .option("--types <types>", `Comma-separated strip types (default: all 5 info types)`)
    .option("--output-dir <dir>", "Output directory for stripped files (required)")
    .action(async (input: string, options: { types?: string; outputDir?: string }) => {
      try {
        if (!options.outputDir) {
          console.error("Error: --output-dir is required");
          process.exitCode = 1;
          return;
        }

        const inputPath = resolve(input);
        if (!existsSync(inputPath)) {
          console.error(`Error: Input file not found: ${inputPath}`);
          process.exitCode = 1;
          return;
        }

        const designTree = readFileSync(inputPath, "utf-8");

        const types: DesignTreeInfoType[] = options.types
          ? options.types.split(",").map(t => t.trim()) as DesignTreeInfoType[]
          : [...DESIGN_TREE_INFO_TYPES];

        const outputDir = resolve(options.outputDir);
        mkdirSync(outputDir, { recursive: true });

        const { writeFile: writeFileAsync } = await import("node:fs/promises");

        for (const type of types) {
          const stripped = stripDesignTree(designTree, type);
          const outputPath = join(outputDir, `${type}.txt`);
          await writeFileAsync(outputPath, stripped, "utf-8");
          console.log(`  ${type}.txt (${Math.round(Buffer.byteLength(stripped) / 1024)}KB)`);
        }

        console.log(`Stripped ${types.length} design-tree variants → ${outputDir}`);
      } catch (error) {
        console.error("\nError:", error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
