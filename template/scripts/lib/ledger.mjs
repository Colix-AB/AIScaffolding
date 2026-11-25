// The requirements spec and the completed ledger, one file per entry, so
// two PRs adding entries never conflict:
//
//   <ledger>/README.md                  what the ledger is, how to add to it
//   <ledger>/NNN-<area>/README.md        the area's `##` heading and intro
//   <ledger>/NNN-<area>/<entry>.md       one entry, or a `###` sub-heading
//
// Files render in name order. Links are relative to their file.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const LEDGERS = {
  requirements: { entry: /^- \**REQ-/ },
  completed: { entry: /^- (✅|🟡|❌) / },
};

const AREA_DIR = /^\d{3}-[a-z0-9-]+$/;
const ENTRY_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;
const SUB_HEADING = /^#{3,4} /;
const ANY_HEADING = /^#{1,4} /;
const FENCE = /^(```|~~~)/;
const LINK_TARGET = /\]\(<?([^)\s>]+)/g;
const NOT_A_PATH = /^(https?:|mailto:|#)/;
// Links into the ledger's own retired single-file form.
const RETIRED = /^\.\.\/\.\.\/(completed|requirements)\.md(#|$)/;

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const read = (file) => readFileSync(file, "utf8").replaceAll("\r\n", "\n");
const isDir = (p) => statSync(p).isDirectory();
const rel = (...parts) => path.posix.join(...parts);

function areaDirs(ledgerDir) {
  return readdirSync(ledgerDir).filter((name) => isDir(path.join(ledgerDir, name))).sort(byName);
}

const isEntryFile = (areaDir, name) => name !== "README.md" && ENTRY_FILE.test(name) && !isDir(path.join(areaDir, name));

function entryFiles(areaDir) {
  return readdirSync(areaDir).filter((name) => isEntryFile(areaDir, name)).sort(byName);
}

const fromRepoRoot = (text, depth) => text.replaceAll(`](${"../".repeat(depth)}`, "](");

/** The whole ledger as one Markdown document, in reading order, as if at the repo root. */
export function renderLedger(ledgerDir) {
  const parts = [fromRepoRoot(read(path.join(ledgerDir, "README.md")), 1)];
  for (const area of areaDirs(ledgerDir)) {
    const areaDir = path.join(ledgerDir, area);
    parts.push(fromRepoRoot(read(path.join(areaDir, "README.md")), 2));
    for (const file of entryFiles(areaDir)) parts.push(fromRepoRoot(read(path.join(areaDir, file)), 2));
  }
  return parts.map((p) => p.trimEnd()).join("\n\n") + "\n";
}

/** The lines outside fenced code blocks. */
function proseLines(text) {
  let fenced = false;
  return text.split("\n").filter((line) => {
    if (FENCE.test(line)) fenced = !fenced;
    return !fenced && !FENCE.test(line);
  });
}

function linkProblems(relPath, text) {
  const prose = proseLines(text).join("\n").replace(/`[^`\n]*`/g, "");
  const bad = [...prose.matchAll(LINK_TARGET)]
    .map((m) => m[1])
    .filter((t) => !NOT_A_PATH.test(t) && (!t.startsWith("../../") || RETIRED.test(t)));
  if (bad.length === 0) return [];
  return [`${relPath}: links must be relative to this file (../../<path from the repo root>), and not to the retired completed.md / requirements.md: ${bad.join(", ")}`];
}

function secondEntry(kind, lines) {
  return lines.find((line) => LEDGERS[kind].entry.test(line) || ANY_HEADING.test(line));
}

function entryProblems(kind, relPath, text) {
  const [first, ...rest] = proseLines(text);
  if (!LEDGERS[kind].entry.test(first) && !SUB_HEADING.test(first)) {
    return [`${relPath}: must start with an entry line (${LEDGERS[kind].entry.source}) or a ### heading`];
  }
  const second = secondEntry(kind, rest);
  return second ? [`${relPath}: holds more than one entry ("${second.slice(0, 60)}"), so give each its own file`] : [];
}

function areaReadmeProblems(kind, relPath, text) {
  const [first, ...rest] = proseLines(text);
  if (!first.startsWith("## ")) return [`${relPath}: must start with the area's ## heading`];
  const entry = secondEntry(kind, rest);
  if (entry) return [`${relPath}: holds an entry ("${entry.slice(0, 60)}"), which belongs in a file of its own`];
  return linkProblems(relPath, text);
}

function areaProblems(kind, ledgerDir, name) {
  const areaDir = path.join(ledgerDir, name);
  const names = readdirSync(areaDir).sort(byName);
  const problems = names.includes("README.md")
    ? areaReadmeProblems(kind, rel(kind, name, "README.md"), read(path.join(areaDir, "README.md")))
    : [`${rel(kind, name, "README.md")}: missing`];
  for (const file of names.filter((n) => n !== "README.md")) {
    if (!isEntryFile(areaDir, file)) {
      problems.push(`${rel(kind, name, file)}: entries are .md files named like REQ-<ID>.md or <issue>-<slug>.md`);
      continue;
    }
    const text = read(path.join(areaDir, file));
    problems.push(...entryProblems(kind, rel(kind, name, file), text), ...linkProblems(rel(kind, name, file), text));
  }
  return problems;
}

/** Every way the ledger directory breaks the one-entry-per-file layout. */
export function ledgerProblems(ledgerDir, kind) {
  const names = readdirSync(ledgerDir).sort(byName);
  const problems = names.includes("README.md") ? [] : [`${rel(kind, "README.md")}: missing`];
  for (const name of names.filter((n) => n !== "README.md")) {
    if (isDir(path.join(ledgerDir, name)) && AREA_DIR.test(name)) problems.push(...areaProblems(kind, ledgerDir, name));
    else problems.push(`${rel(kind, name)}: only README.md and NNN-<area>/ directories belong here`);
  }
  return problems;
}
