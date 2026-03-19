#!/usr/bin/env node
import cac from "cac";

const cli = cac("drc");

cli
  .command("analyze <file>", "Analyze a Figma file")
  .option("--output <path>", "Report output path")
  .option("--format <format>", "Output format (json | html)", { default: "json" })
  .action((file, options) => {
    console.log(`Analyzing: ${file}`);
    console.log(`Options:`, options);
  });

cli.help();
cli.version("0.1.0");

cli.parse();
