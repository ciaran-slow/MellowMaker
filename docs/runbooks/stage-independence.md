# Runbook — Stage independence and provenance

The per-issue workflow is **plan → build → verify → retro**, and its whole value
rests on one property: each stage runs in a **fresh context**, so the reviewer
does not inherit the builder's assumptions. Issue #14 ran plan, build, verify,
and the blocker fix in **one conversation**. The review found a real blocker, so
the cycle was not wasted — but nothing in the workflow detected the collapse, and
the PR body's builder attribution ("Claude Opus 5") was wrong-or-right with no
way to tell, because the session model had been switched to a different model
immediately before `/build`. A stage's own claim about which model it is cannot
be trusted after a mid-session switch.

This runbook defines (1) the precondition each stage checks before starting and
(2) the provenance block each stage posts, so independence is a **checkable
record** rather than an assumption.

## 1. The fresh-context precondition

Before doing any stage work, check whether **this same context already ran a
prior stage of this same issue**. Positive signals, any one of which means the
context is shared:

- this conversation already posted the plan comment on the issue;
- this conversation already created the issue branch, committed to it, or opened
  the PR;
- this conversation already posted a PR review for this issue;
- an earlier `/plan`, `/build`, or `/verify` invocation for this issue number
  appears in the transcript;
- the working tree already contains this issue's implementation and the
  conversation authored it.

Being in a fresh **git worktree** is not the same as a fresh **context**. The
worktree isolates files; only a new conversation isolates judgment.

If the context is shared, **stop and tell the user to start the stage in a fresh
context**, preferably with a different model. Do not silently proceed. If the
user explicitly directs the stage to continue anyway, it runs under two
obligations:

1. Lead the posted artifact (plan comment, PR body, or review) with an
   **`Independence: COMPROMISED`** line naming which stages shared the context.
2. State what would have to be re-run independently before merge, and treat the
   pass as advisory. A verify pass in a shared context never upgrades an
   acceptance criterion from "unproven" to "proven" on its own.

## 2. The stage-provenance block (mandatory in every posted artifact)

Every stage ends its posted artifact with this block, verbatim keys, one per
line:

```
Stage-Provenance:
  stage: plan | build | verify
  context: fresh | shared
  prior-stages-in-this-context: none | plan, build, verify
  model: <the model id the harness reports for this run> | unverifiable
  model-switched-mid-session: no | yes | unknown
```

Rules for filling it in:

- **`model` is a claim, not proof.** Write the id only when you can read it from
  the harness for *this* run. If the session model was switched at any point, or
  you are reporting it from memory of how the session started, write
  `unverifiable`. A confident wrong model id is worse than an honest
  `unverifiable`: it makes the next stage believe an independence check passed.
- **`model-switched-mid-session: yes` forces `model: unverifiable`.** These two
  fields never disagree.
- `context: shared` requires the `Independence: COMPROMISED` disclosure in §1.

## 3. Checking the record

```sh
node scripts/check-stage-provenance.js <issue> [<pr>]
```

The script reads the issue comments and the PR body and reviews through `gh`,
extracts every provenance block, and exits non-zero when:

- a stage's artifact carries no block;
- any block declares `context: shared`;
- any block declares an unverifiable or switched model **without** saying so.

It warns (without failing) when two stages report the same model id, which is
allowed but weaker than running verify on a different model.

The `verify` stage runs this before reporting, and reports the result as part of
its independence statement. The `retro` stage runs it over the closed cycle and
treats any failure as a finding to route into a skill or doc — never into
memory.

**An artifact that predates this rule is context, not a defect.** The provenance
block was introduced by PR #47; a plan comment, PR body, or review posted before
that merged carries no block and never could have. The script cannot tell that
apart from a stage that simply skipped the block, so it reports the missing
block either way and exits non-zero. When an artifact predates the rule, compare
its posting timestamp against #47's merge, record the outcome in one line —
"plan: no block; the plan comment (posted `<date>`) predates the rule introduced
by PR #47" — and do **not** route it as a finding. #42's verify did exactly
this and it is the expected handling.

Do **not** retro-fit an addendum comment onto the issue to make the script pass.
It would post a provenance claim the stage never made, about a context nobody
can now inspect — precisely the confidently-wrong record §2 exists to prevent —
and it would erase the one honest signal, that this artifact is older than the
rule. Every artifact posted **after** #47 merged is in scope, and a missing
block there is a real defect.

## 4. The `type: decision` variant

A `type: decision` issue runs the same four stages under different names
(`docs/runbooks/decision-issues.md`): **frame** in place of plan, **record** in
place of build, an adapted **verify**, then retro. Independence matters at least
as much there — a record stage that also did the framing will record its own
recommendation as the owner's decision — so the block is mandatory in the framing
comment, the record PR body, and the verify review, exactly as above.

Use the decision-issue stage names in the block:

```
  stage: frame | record | verify
```

`frame` and `record` are accepted aliases for `plan` and `build`, and
`scripts/check-stage-provenance.js` resolves them, so one script covers both
issue shapes and still fails when a stage is missing entirely. Write the name the
stage actually ran under; a decision issue whose record PR says `stage: build` is
not a defect, but the alias is clearer.

**A retro that posts on the issue writes `stage: retro`.** The retro normally
lands a PR and posts nothing, but an acceptance criterion can name the issue as
the place an artifact belongs — #46's AC5 required the spike's go/no-go
"posted on the issue", and the retro was the stage that put it there. Such a
comment declares its provenance like any other stage artifact.
`scripts/check-stage-provenance.js` recognises `retro` and judges its context and
model, but does **not** require it: a cycle still in flight has no retro yet, and
a missing one is not an independence defect. Do not write `stage: retro` on a
comment the retro did not author.

**The owner-decision comment carries no block.** The comment required by
`decision-issues.md` §2 records what the *product owner* decided; the agent that
posts it is a courier, not a stage. Attaching a provenance block to it would claim
a stage ran where none did. Its integrity comes from a different property — it
must be posted by the session that conducted the escalation, before the record
stage starts, and never by the record stage itself.

## 5. Why not enforce it in CI

Provenance describes *how the work was produced*, not what the code does, and it
lives on GitHub artifacts rather than in the tree — CI has no honest way to
verify a model id either. The check is a stage-run gate operated by the verify
and retro stages, deliberately outside `npm run lint` / `npm run test:ci` so a
green build never implies an independence claim was validated.
