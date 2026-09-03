#!/usr/bin/env node
/**
 * Stage-independence check for the per-issue workflow (plan -> build -> verify).
 *
 * Issue #14 ran plan, build, verify and the blocker fix in a single
 * conversation, and the PR body claimed a builder model that could not be true
 * because the session model had been switched immediately before the build. No
 * gate noticed either fact. This script turns the independence claim into
 * something checkable: it reads the provenance blocks each stage is required to
 * post (see docs/runbooks/stage-independence.md) and fails when a stage did not
 * declare its context, declared a shared one, or claimed a model id while also
 * admitting the session model was switched.
 *
 * Usage: node scripts/check-stage-provenance.js <issue> [<pr>]
 *
 * Requires the GitHub CLI, and network access, so it is deliberately NOT part
 * of `npm run lint` or `npm run test:ci`: a green build must never be mistaken
 * for a validated independence claim.
 */

const { execFileSync } = require('node:child_process');

const REPO = 'ciaran-slow/MellowMaker';
const STAGES = ['plan', 'build', 'verify'];

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Parse every `Stage-Provenance:` block in a body. The block is a header line
 * followed by indented `key: value` lines; parsing stops at the first line that
 * is not one of those, so surrounding prose is ignored.
 */
function parseBlocks(body, source) {
  const blocks = [];
  const lines = String(body ?? '').split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*(?:[#*>\-`]*\s*)?Stage-Provenance\s*:?\s*$/i.test(lines[i])) {
      continue;
    }

    const fields = {};
    for (let j = i + 1; j < lines.length; j += 1) {
      const match = /^\s*[-*]?\s*([a-z-]+)\s*:\s*(.+?)\s*$/i.exec(lines[j]);
      if (!match) {
        if (/^\s*(?:```)?\s*$/.test(lines[j])) {
          continue;
        }
        break;
      }
      fields[match[1].toLowerCase()] = match[2].replace(/[`*]/g, '').trim();
    }

    if (Object.keys(fields).length > 0) {
      blocks.push({ source, fields });
    }
  }

  return blocks;
}

function collect(issue, pr) {
  const blocks = [];

  const issueJson = JSON.parse(
    gh(['issue', 'view', String(issue), '--repo', REPO, '--json', 'comments']),
  );
  for (const comment of issueJson.comments ?? []) {
    blocks.push(...parseBlocks(comment.body, `issue #${issue} comment`));
  }

  if (pr) {
    const prJson = JSON.parse(
      gh(['pr', 'view', String(pr), '--repo', REPO, '--json', 'body,reviews']),
    );
    blocks.push(...parseBlocks(prJson.body, `PR #${pr} body`));
    for (const review of prJson.reviews ?? []) {
      blocks.push(...parseBlocks(review.body, `PR #${pr} review`));
    }
  }

  return blocks;
}

/**
 * Judge a set of parsed blocks. Split out from `main` so the parsing and the
 * rules are testable without the network (`tests/stageProvenance.test.js`).
 */
function evaluate(blocks) {
  const problems = [];
  const warnings = [];

  const seen = new Map();
  for (const block of blocks) {
    const stage = (block.fields.stage ?? '').toLowerCase();
    if (!STAGES.includes(stage)) {
      problems.push(
        `${block.source}: provenance block has no recognised \`stage\` (got "${block.fields.stage ?? ''}")`,
      );
      continue;
    }
    seen.set(stage, block);

    const context = (block.fields.context ?? '').toLowerCase();
    if (context === 'shared') {
      problems.push(
        `${stage}: ran in a SHARED context (prior stages: ${block.fields['prior-stages-in-this-context'] ?? 'unstated'}) — not the independent pass the workflow intends`,
      );
    } else if (context !== 'fresh') {
      problems.push(`${stage}: \`context\` must be \`fresh\` or \`shared\` (got "${block.fields.context ?? ''}")`);
    }

    const model = (block.fields.model ?? '').toLowerCase();
    const switched = (block.fields['model-switched-mid-session'] ?? '').toLowerCase();
    if (!model) {
      problems.push(`${stage}: no \`model\` recorded`);
    } else if (switched !== 'no' && model !== 'unverifiable') {
      problems.push(
        `${stage}: claims model "${block.fields.model}" while \`model-switched-mid-session\` is "${block.fields['model-switched-mid-session'] ?? 'unstated'}" — a switched or unstated session must record \`model: unverifiable\``,
      );
    }
  }

  for (const stage of STAGES) {
    if (!seen.has(stage)) {
      problems.push(`${stage}: no Stage-Provenance block found in any posted artifact`);
    }
  }

  const models = [...seen.entries()]
    .map(([stage, block]) => [stage, (block.fields.model ?? '').toLowerCase()])
    .filter(([, model]) => model && model !== 'unverifiable');
  const buildModel = models.find(([stage]) => stage === 'build');
  const verifyModel = models.find(([stage]) => stage === 'verify');
  if (buildModel && verifyModel && buildModel[1] === verifyModel[1]) {
    warnings.push(
      `build and verify both ran on "${buildModel[1]}" — allowed, but a different model for verify is preferred`,
    );
  }

  return { problems, warnings };
}

function main() {
  const [issue, pr] = process.argv.slice(2);

  if (!issue) {
    console.error('usage: node scripts/check-stage-provenance.js <issue> [<pr>]');
    process.exit(2);
  }

  const { problems, warnings } = evaluate(collect(issue, pr));

  for (const warning of warnings) {
    console.log(`warning: ${warning}`);
  }

  if (problems.length > 0) {
    console.error(`Stage independence: ${problems.length} problem(s) for issue #${issue}:`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    console.error('See docs/runbooks/stage-independence.md.');
    process.exit(1);
  }

  console.log(
    `Stage independence: every stage of issue #${issue} declared a fresh context with a consistent model record.`,
  );
}

if (require.main === module) {
  main();
}

module.exports = { parseBlocks, evaluate, STAGES };
