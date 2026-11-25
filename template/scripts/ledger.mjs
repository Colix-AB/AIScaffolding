// Reads the requirements spec or the completed ledger as one document.
//
//   npm run -s ledger -- completed              print completed/ in order
//   npm run -s ledger -- requirements > r.md    or save it to read elsewhere
//   npm run -s ledger -- --check                fail on a layout problem
//
// The printed document is a view, never a file to edit: change the entry file.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { LEDGERS, ledgerProblems, renderLedger } from "./lib/ledger.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [arg] = process.argv.slice(2);

if (arg === "--check") {
  const problems = Object.keys(LEDGERS).flatMap((kind) => ledgerProblems(path.join(repoRoot, kind), kind));
  for (const p of problems) console.error(`✖ ${p}`);
  process.exitCode = problems.length > 0 ? 1 : 0;
} else if (Object.hasOwn(LEDGERS, arg ?? "")) {
  process.stdout.write(renderLedger(path.join(repoRoot, arg)));
} else {
  console.error(`Usage: npm run -s ledger -- <${Object.keys(LEDGERS).join("|")}|--check>`);
  process.exitCode = 2;
}
