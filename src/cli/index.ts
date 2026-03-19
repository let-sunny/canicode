#!/usr/bin/env node
import cac from "cac";

const cli = cac("drc");

cli
  .command("analyze <file>", "Figma 파일 분석")
  .option("--output <path>", "리포트 출력 경로")
  .option("--format <format>", "출력 포맷 (json | html)", { default: "json" })
  .action((file, options) => {
    console.log(`Analyzing: ${file}`);
    console.log(`Options:`, options);
  });

cli.help();
cli.version("0.1.0");

cli.parse();
