/**
 * Round-trip test: markdown → HTML → markdown (on a whole file).
 *
 * Exercises the full pipeline (remark/rehype + normalizeMarkdown)
 * without needing a browser. Catches most formatting regressions.
 *
 * Usage: npx tsx scripts/test-roundtrip.ts [file.md]
 */

import { readFileSync } from "fs";
import { roundTrip } from "./pipeline";

const file = process.argv[2] || "test.md";
const input = readFileSync(file, "utf-8");

function showDiff(input: string, output: string) {
  const inLines = input.split("\n");
  const outLines = output.split("\n");
  const maxLen = Math.max(inLines.length, outLines.length);
  let diffs = 0;

  for (let i = 0; i < maxLen; i++) {
    const a = inLines[i] ?? "";
    const b = outLines[i] ?? "";
    if (a !== b) {
      diffs++;
      console.log(`\x1b[33mL${i + 1}:\x1b[0m`);
      console.log(`  \x1b[31m- ${a}\x1b[0m`);
      console.log(`  \x1b[32m+ ${b}\x1b[0m`);
    }
  }

  if (diffs === 0) {
    console.log("\x1b[32m✓ Round-trip clean — no differences\x1b[0m");
  } else {
    console.log(`\n\x1b[33m${diffs} line(s) differ\x1b[0m`);
  }
  return diffs;
}

(async () => {
  console.log(`Testing round-trip: ${file}\n`);
  const output = await roundTrip(input);
  const diffs = showDiff(input, output);
  console.log("\n--- Full output ---\n");
  console.log(output);
  if (diffs > 0) process.exit(1);
})();
