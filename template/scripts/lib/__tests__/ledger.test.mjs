import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEDGERS, ledgerProblems, renderLedger } from "../ledger.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function tempLedger(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ledger-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

const area = (files) => tempLedger({ "README.md": "# Completed\n", "001-gen/README.md": "## General\n", ...files });

for (const kind of Object.keys(LEDGERS)) {
  test(`${kind}/ keeps one entry per file`, () => {
    assert.deepEqual(ledgerProblems(path.join(repoRoot, kind), kind), []);
  });

  test(`${kind}.md stays retired, so no PR appends to one shared file again`, () => {
    assert.equal(existsSync(path.join(repoRoot, `${kind}.md`)), false);
  });
}

test("an area renders README first, then entries in file-name order", () => {
  const root = tempLedger({
    "README.md": "# Completed\n",
    "002-later/README.md": "## Later\n",
    "001-first/README.md": "## First\n\nIntro.\n",
    "001-first/12-new.md": "- ✅ **new**\n",
    "001-first/0002-b.md": "- 🟡 **b**\n  gap\n\n",
    "001-first/0001a-sub.md": "- ✅ **slotted after a**\r\n",
    "001-first/0001-a.md": "- ✅ **a**\n",
    "001-first/0002-b.md.orig": "- ✅ **left over from a conflict**\n",
  });
  assert.equal(
    renderLedger(root),
    "# Completed\n\n## First\n\nIntro.\n\n- ✅ **a**\n\n- ✅ **slotted after a**\n\n- 🟡 **b**\n  gap\n\n- ✅ **new**\n\n## Later\n",
  );
});

test("links are stored relative to their file and rendered relative to the repo root", () => {
  const root = tempLedger({
    "README.md": "# Completed\n\nSee [the spec](../requirements/).\n",
    "001-gen/README.md": "## General\n",
    "001-gen/0001-a.md": "- ✅ **a** in [x.js](../../backend/x.js), [docs](https://example.com), [up](#top), `arr[0](i)`.\n",
  });
  assert.deepEqual(ledgerProblems(root, "completed"), []);
  assert.equal(
    renderLedger(root),
    "# Completed\n\nSee [the spec](requirements/).\n\n## General\n\n- ✅ **a** in [x.js](backend/x.js), [docs](https://example.com), [up](#top), `arr[0](i)`.\n",
  );
});

test("every link not relative to its file, or into a retired file, is named", () => {
  const root = area({
    "001-gen/1-a.md": "- ✅ **a** [x](backend/x.js) [y](../backend/y.js) [r](../../requirements.md#gen) [ok](../../backend/z.js)\n",
  });
  assert.deepEqual(ledgerProblems(root, "completed"), [
    "completed/001-gen/1-a.md: links must be relative to this file (../../<path from the repo root>), and not to the retired completed.md / requirements.md: backend/x.js, ../backend/y.js, ../../requirements.md#gen",
  ]);
});

test("a file holding two entries is refused", () => {
  const root = tempLedger({
    "README.md": "# Requirements\n",
    "001-gen/README.md": "## General\n",
    "001-gen/REQ-GEN-01.md": "- REQ-GEN-01: one.\n- REQ-GEN-02: two.\n",
  });
  assert.match(ledgerProblems(root, "requirements").join("\n"), /REQ-GEN-01\.md: holds more than one entry/);
});

test("a heading inside a fenced code block is not a second entry", () => {
  const root = area({ "001-gen/1-a.md": "- ✅ **a**\n\n  Run it:\n\n```bash\n# rebuild\nnpm run x\n```\n" });
  assert.deepEqual(ledgerProblems(root, "completed"), []);
});

test("an entry appended to an area README is refused", () => {
  const root = tempLedger({ "README.md": "# Completed\n", "001-gen/README.md": "## General\n\n- ✅ **appended**\n" });
  assert.deepEqual(ledgerProblems(root, "completed"), [
    "completed/001-gen/README.md: holds an entry (\"- ✅ **appended**\"), which belongs in a file of its own",
  ]);
});

test("an entry file must open with an entry or a sub-heading", () => {
  const root = area({ "001-gen/1-x.md": "Some prose.\n", "001-gen/0001-sub.md": "### A sub-heading\n\nIts intro.\n" });
  assert.deepEqual(ledgerProblems(root, "completed"), [
    "completed/001-gen/1-x.md: must start with an entry line (^- (✅|🟡|❌) ) or a ### heading",
  ]);
});

test("stray files and badly named areas are refused", () => {
  const root = tempLedger({
    "README.md": "# Completed\n",
    "notes.md": "x\n",
    "General/README.md": "## General\n",
    "001-gen/README.md": "no heading\n",
    "001-gen/has space.md": "- ✅ x\n",
  });
  assert.deepEqual(ledgerProblems(root, "completed"), [
    "completed/001-gen/README.md: must start with the area's ## heading",
    "completed/001-gen/has space.md: entries are .md files named like REQ-<ID>.md or <issue>-<slug>.md",
    "completed/General: only README.md and NNN-<area>/ directories belong here",
    "completed/notes.md: only README.md and NNN-<area>/ directories belong here",
  ]);
});
