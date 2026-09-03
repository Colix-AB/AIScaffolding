# Customizing the Scaffold

The scaffold is deliberately opinionated — that's what makes it useful. But every project has to make a handful of decisions before the flow fits, and a few of the gates only apply to some products.

Work through this once, at adoption. It takes about an hour and it's the difference between skills that get followed and skills that get ignored.

---

## 1. Fill in the placeholders

Everything in angle brackets is a decision. Find them all:

```bash
grep -rn "<[A-Z][A-Z /|…-]*>" CLAUDE.md .claude/skills/ requirements.md completed.md
```

The ones that matter most, in order:

| Placeholder | Where | What to decide |
| ----------- | ----- | -------------- |
| `<PROJECT>` | `CLAUDE.md`, docs | Your project name |
| `<npm run lint>` / `<npm run lint:fix>` | `CLAUDE.md` §4, several skills | The exact lint/format commands, and the style choices they enforce |
| `<TEST RUNNER>` + flags | `ship-issue` 4, `iterate-*` | How to run **one test file** with the same flags as the full script |
| `<path/to/schema>` | `relational-db-design` | Your schema file, ORM, and database |
| `<path/to/canonical.openapi.yaml>` | `openapi-contract` | Your spec path + generator + validator commands |
| `snake_case` / `camelCase` | `wire-casing` | **The** casing decision, and where the one mapping boundary lives |
| `<HOST A>` / `<HOST B>` | `CLAUDE.md` §8, `cross-host-parity` | Your two hosts — or delete the section (see 3) |
| `<infrastructure-as-code>` | `config-and-secrets` | How production config and secrets are provisioned |

**`stack-conventions/SKILL.md` is the one skill you must rewrite**, not just fill in. It declares your layering, idioms, state locations, and test patterns. Keep it short — a convention nobody can recite isn't a convention.

---

## 2. Decide the wire casing, once

`wire-casing` is written as: one casing everywhere, one static mapping boundary at the ORM, **no runtime key transform anywhere**. The template picks `snake_case` on the wire with the physical columns left as they are.

Pick either direction, but **pick one and write it down**. The rule that actually matters is the third one: a global request/response key-rewriter is what *causes* casing drift, because it silently succeeds for keys nobody meant to transform. If your project has one today, that's a §3 convergence project, not a gate you can enforce.

Also list your **legitimately-divergent islands** (auth-token claims, author/vendor JSON blob contents, multipart field names). An unlisted island gets "fixed" by a well-meaning codemod, which is worse than the drift.

---

## 3. Turn gates off deliberately

Two sections are product-dependent:

- **§8 multi-host parity.** Delete the section body if you render one host — but **keep the number reserved**, because a dozen skills cite `§8`. Also delete `cross-host-parity/SKILL.md` and the parity rows in the obligation tables.
- **Feature flags.** If you have no runtime flag system, delete `feature-flags` + `remove-feature-flag`, the `**Flag:**` line from `github-issue`, and the flag steps from `ship-issue` 0.6 / `iterate-start` 2.5. Don't leave a decision line pointing at a mechanism that doesn't exist — the flow will faithfully ask about it forever.

Anything else you delete, **delete its cross-references too**. A skill link that 404s is how a skill set starts being treated as decoration.

---

## 4. Add the decision lines your product needs

The issue template carries `**Flag:**`. Add at most two more when your product has a call that is expensive to retrofit and easy to forget:

- **`**Exposure:**`** — if you have an agent/automation layer that composes features from a catalog, every feature must record whether it's reachable by it (`exposed — <how it reaches the catalog/prompt/validator>` / `not exposed — <reason>`). Retrofitting exposure means re-deriving prop schemas for a feature you've already shipped.
- **`**Tier:**`** — if capabilities are gated by plan, record which tier gets it. A paid-only capability should be **visible but disabled** in the UI *and* blocked in the backend; hiding it teaches users nothing and trusting the UI alone is a security bug.
- **`**Parity:**`** — if §8 applies and your slices vary in which hosts they touch.

Then teach the line to three places, or it will be ignored: `github-issue` (write it), `ship-issue` step 0 (confirm it), `iterate-start` step 2 (decide it).

---

## 5. Build the lockstep register

[`lockstep-contracts`](../template/.claude/skills/lockstep-contracts/SKILL.md) ships with a register of archetypes. **Replace them with your real sets**, and add the row the moment a concept gets its second site.

Find your existing ones by asking: *what breaks quietly when someone changes only one place?* Every codebase has three or four — a permission list, a hand-walked entity allowlist, a set of locale bundles, a registry the build scans.

For each, name the **enforcement**. A set with a bidirectional CI scan is safe. A set that is only "reviewer-enforced" should say so, so nobody assumes there's a net.

---

## 6. Wire the gates into CI

The skills are only as strong as the gates behind them. At minimum, CI should run: the linter (with the format rules as errors), the test suites, the API-spec validator, the production build, and any lockstep scan you have.

Two that repay themselves quickly:

- **A bidirectional registry scan** for flag keys (or any registry): fails on a call site with no entry *and* an entry with no call site. This is what makes atomic removal possible.
- **A spec-staleness check** that fails when a generated spec doesn't match its canonical source.

---

## 7. Set up the agents

`.claude/agents/` holds seven roles. Point their bodies at your stack, narrow their tool lists, and add roles you need — remembering that **an agent nothing dispatches never runs**, so add it to the dispatch tables in `ship-issue` and `iterate-finish` too. See [`agents/README.md`](../template/.claude/agents/README.md).

---

## 8. Seed the two documents

`requirements.md` and `completed.md` start as templates. Don't backfill your entire history — that's a week of archaeology nobody reads.

Instead: **write the REQ areas** (the `##` headings with their prefixes) for the whole product now, since the numbering is permanent, and then let `completed.md` fill in from the first change you ship through the flow. Add historical entries only where a reader would otherwise re-litigate something — particularly **reversals**: "we tried X and backed it out because Y" is the highest-value line in the file.

---

## 9. Keep it honest

The failure mode for a scaffold like this isn't rejection, it's decoration: the files stay, and the flow quietly stops being followed. Two habits prevent it.

- **When a skill is wrong, fix the skill.** A skill that describes a path the code no longer has is worse than no skill, because it will be followed.
- **When something bites you twice, write it down** — in the skill that owns it, in one tight line. The most valuable content in this scaffold is the "this specific thing has bitten us" notes, and they only exist because someone added them the second time.
