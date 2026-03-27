import type { CAC } from "cac";
import { z } from "zod";

import {
  initAiready, getConfigPath, getReportsDir,
} from "../../core/engine/config-store.js";

const InitOptionsSchema = z.object({
  token: z.string().optional(),
});

export function registerInit(cli: CAC): void {
  cli
    .command("init", "Set up canicode with Figma API token")
    .option("--token <token>", "Save Figma API token to ~/.canicode/")
    .action((rawOptions: Record<string, unknown>) => {
      try {
        const parseResult = InitOptionsSchema.safeParse(rawOptions);
        if (!parseResult.success) {
          const msg = parseResult.error.issues.map(i => i.message).join("\n");
          console.error(`\nInvalid options:\n${msg}`);
          process.exit(1);
        }
        const options = parseResult.data;

        if (options.token) {
          initAiready(options.token);

          console.log(`  Config saved: ${getConfigPath()}`);
          console.log(`  Reports will be saved to: ${getReportsDir()}/`);
          console.log(`\n  Next: canicode analyze "https://www.figma.com/design/..."`);
          return;
        }

        // No flags: show setup guide
        console.log(`CANICODE SETUP\n`);
        console.log(`  canicode init --token YOUR_FIGMA_TOKEN`);
        console.log(`  Get token: figma.com > Settings > Personal access tokens\n`);
        console.log(`After setup:`);
        console.log(`  canicode analyze "https://www.figma.com/design/..."`);
      } catch (error) {
        console.error(
          "\nError:",
          error instanceof Error ? error.message : String(error)
        );
        process.exitCode = 1;
      }
    });
}
