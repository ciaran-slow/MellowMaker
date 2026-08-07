---
name: workmux
description: Reference for the workmux CLI that manages git worktrees and
  tmux windows as isolated development environments. Use when the user
  mentions workmux, worktrees, or parallel agent workflows.
---

# workmux

workmux manages git worktrees paired with tmux windows for parallel
development. Each worktree is an isolated workspace with its own branch,
terminal state, and AI agent.

**If the user asks you to create worktrees or dispatch tasks (e.g.,
"/workmux add ..."), you are a dispatcher.** Write prompt files and run
commands. Do NOT explore, read, or research the codebase first. Use
context you already have. The worktree agent does all the work.

## Key Concepts

- **Handle**: the worktree directory name, derived from the branch name
  (slugified). Used to identify worktrees in all commands
- **GitHub issue naming**: when creating a worktree for a GitHub issue, prefix
  the branch/handle with the issue number, for example
  `1462-billing-xero-repeating-sync`, so active work stays sortable and easy to
  match back to the board
- **Worktree directory**: defaults to `<project>__worktrees/<handle>` as a
  sibling of the project root
- **Window prefix**: tmux windows are named `wm-<handle>` by default
  (configurable via `window_prefix`)
- **Agent status**: agents report status via hooks: working, waiting (needs
  input), done (finished)

## Commands

### Create a worktree

```bash
workmux add <branch-name>
```

Creates a git worktree, runs file operations and hooks, creates a tmux
window with configured pane layout, and switches to it.

Key flags:
- `-b, --background`: create without switching to it
- `-p <text>`: inline prompt for AI agent panes
- `-P <file>`: prompt from file
- `-e, --prompt-editor`: write prompt in $EDITOR
- `-A, --auto-name`: generate branch name from prompt via LLM
- `-a <agent>`: override the agent (can specify multiple for multi-worktree)
- `-w, --with-changes`: move uncommitted changes to the new worktree
- `--base <branch>`: branch from a specific base
- `--name <name>`: override the handle name
- `-o, --open-if-exists`: open existing worktree if it exists (idempotent)
- `-W, --wait`: block until the tmux window is closed
- `-n, --count <N>`: create N worktree instances
- `--foreach <matrix>`: create worktrees from variable matrix
- `--no-hooks, --no-file-ops, --no-pane-cmds`: skip setup steps

### List worktrees

```bash
workmux list          # all worktrees
workmux list --pr     # with GitHub PR status
workmux list <name>   # filter by handle or branch
```

Shows branch, agent status, tmux window status, and unmerged commits.

### Merge a branch

```bash
workmux merge                 # merge current branch into main
workmux merge <branch>        # merge specific branch
workmux merge --rebase        # rebase before merging (linear history)
workmux merge --squash        # squash all commits into one
workmux merge --into <branch> # merge into a different target branch
workmux merge --keep          # merge but keep worktree/window/branch
workmux merge --notification  # show system notification on success
```

Merges the branch, deletes the tmux window, removes the worktree, and
deletes the local branch. Use the `/merge` skill for the full workflow
(commit, rebase, then merge).

### Remove worktrees

```bash
workmux remove                # current worktree
workmux remove <name>...      # specific worktrees
workmux rm --gone             # worktrees whose remote branch was deleted
workmux rm --all              # all worktrees
workmux rm -f <name>          # force, skip confirmation
workmux rm --keep-branch      # keep the branch, remove worktree + window
```

**Submodule data-loss warning:** workmux **clones** submodules into each
worktree. Removing a worktree deletes that clone, destroying any submodule
commit not pushed to a remote — and a clean superproject pointer does *not*
imply the submodule is clean. Before bulk-removing worktrees in a repo with
submodules, check each worktree's submodules yourself and treat anything
unpushed as a stop:

```bash
# in each worktree, for each submodule: is anything unpushed or dirty?
git submodule foreach 'git status --porcelain; git log --oneline @{u}..HEAD 2>/dev/null'
```

Empty output for every submodule means removal is safe. Any output means
something would be destroyed.

### Open / close windows

```bash
workmux open <name>           # open or switch to tmux window
workmux open --new            # force a new window (creates suffix -2, -3)
workmux open <name> -p "..."  # open with a prompt for agent panes
workmux close <name>          # close tmux window, keep worktree
```

### Interact with other agents

These commands target agents by their worktree handle. If the handle is
not found in the current repo, workmux searches all active agents globally.
Use `project:handle` syntax to disambiguate when names collide.

```bash
# Check agent statuses
workmux status                          # all agents
workmux status auth api-tests           # specific agents

# Wait for agents
workmux wait agent-a agent-b            # block until done
workmux wait agent-a --timeout 3600     # with timeout (seconds)
workmux wait agent-a agent-b --any      # wait for first to finish
workmux wait agent-a --status working   # wait for specific status

# Read agent terminal output
workmux capture agent-a                 # last 200 lines (default)
workmux capture agent-a -n 50           # last 50 lines

# Send instructions to an agent
workmux send agent-a "fix the tests"    # short message
workmux send agent-a "/merge"           # send a skill command
workmux send agent-a -f followup.md     # from file
workmux send myproject:docs "update the API section"  # cross-project

# Run shell commands in an agent's worktree
workmux run agent-a -- pytest tests/    # wait and stream output
workmux run agent-a -b -- npm run build # run in background
```

### Other commands

```bash
workmux path <name>           # print worktree filesystem path
workmux dashboard             # TUI dashboard of all active agents
workmux config edit           # open global config in $EDITOR
workmux config reference      # print default config with all options documented
workmux init                  # generate .workmux.yaml in current project
```

## Known issues

### `status`/`capture`/`send` fail with "malformed live pane information"

If `workmux status`, `workmux capture <handle>`, or `workmux send <handle>`
fail with `Error: tmux returned malformed live pane information for %N`,
workmux is holding a stale per-pane state file for a tmux pane that no longer
exists (from a worktree/window that was removed by merge, `rm`, or a crash).
workmux does not prune this file when the pane goes away.

Fix: find and delete the matching file, then retry.

```bash
# %N is the pane id from the error message (e.g. %3)
ls ~/.local/state/workmux/agents/ | grep '%N\.json$'
rm ~/.local/state/workmux/agents/tmux__*__%N.json
workmux status   # should work now
```

This is expected to recur after every lane that completes and gets cleaned
up (and especially after any workmux/tmux crash) — treat it as a known,
~30-second fix rather than a fresh investigation. Do not delete the state
file matching your own currently-live pane (check `tmux list-panes -a -F
'#{pane_id}'` first) — only remove files for pane ids that no longer exist.

### Post-crash recovery checklist

After any workmux/tmux crash, before resuming normal work:

1. Run `workmux resurrect` to restore worktree windows.
2. **Resume the real conversation in each restored pane — `resurrect`
   only restores the window/pane layout, not the agent's memory.** It
   launches a brand-new, empty `claude` process in the agent pane. Typing
   `claude --continue` (or any other shell command) directly into that
   pane does NOT work — the pane is already inside a live, empty Claude
   Code TUI, so the text is submitted as a *chat message*, not executed
   as a shell command, and the fresh session will happily generate a
   plausible-sounding but context-free reply (it can fake plausibility by
   reading git state with tools). This also poisons `--continue` for
   later: that accidental exchange creates a new, more-recently-modified
   transcript in the same project directory, so `--continue` (which
   picks the most-recently-modified transcript) will resume the
   contaminated stray session instead of the real one, even after you've
   exited it cleanly.

   Correct procedure, per pane:
   - Before touching the pane, find the real pre-crash session id:
     `ls -lt ~/.claude/projects/<slugified-worktree-path>/*.jsonl` — the
     large, old file is the real conversation; anything created since
     the crash is a stray.
   - Confirm the pane is at a shell prompt (not already inside a running
     Claude TUI) before sending anything. If a fresh empty session is
     already running there, exit it first with the chat command `/exit`
     (not Ctrl-C, which doesn't reliably quit it) — the stray transcript
     it leaves behind is harmless and doesn't need cleanup.
   - Then run the real resume as an actual shell command:
     `tmux send-keys -t <pane> "claude --resume <real-session-id>" Enter`.

3. **Regenerate the sidebar/`workmux status` entry for each resumed
   pane — it will not reappear on its own.** `workmux status` (and the
   sidebar/dashboard built on it) is driven entirely by per-pane JSON
   files at `~/.local/state/workmux/agents/tmux__<encoded-socket>__<pane-
   id>.json`, written only by the `PostToolUse`/`Stop`/`UserPromptSubmit`
   hooks in `~/.claude/settings.json` (each just runs `workmux
   set-window-status <state>`). Those hooks fire only on a *new* turn —
   a bare `--resume` that just redisplays history fires nothing, so the
   lane stays invisible in the sidebar until its agent does something on
   its own. Don't wait for that (and don't nudge the agent into unwanted
   action just to populate a status file); regenerate it directly:
   - `workmux set-window-status <state>` resolves *which pane's* file to
     write via the `TMUX_PANE` env var of the process invoking it — not
     cwd, not any pane search. Run bare in some other shell pane, it
     silently writes (or updates) *that shell pane's own* entry
     (`"command": "zsh"`), which `workmux status` filters out as
     non-agent — this looks like a no-op but isn't one, it just wrote to
     the wrong key.
   - It also expects the same stdin JSON a real Claude Code hook
     receives (`session_id`, `transcript_path`, `cwd`,
     `hook_event_name`) to populate the file's fields.
   - Fix: invoke it from any other pane/shell with `TMUX_PANE` overridden
     to the *agent's* pane id, piping in that JSON, e.g.:
     ```bash
     TMUX_PANE=%1 bash -c 'echo "{\"session_id\":\"<id>\",\"transcript_path\":\"<path>.jsonl\",\"cwd\":\"<worktree-path>\",\"hook_event_name\":\"Stop\"}" | workmux set-window-status done'
     ```
     This creates the correctly-keyed file (`"command": "claude"`,
     `"agent_kind": "claude"`) and the lane reappears in `workmux status
     --json` and the sidebar within ~1s. Never send text into the live
     agent pane itself to try to trigger this — it lands in the chat
     input, not a shell.

4. Clean up any stale agent state files per the recovery steps above —
   compare `ls ~/.local/state/workmux/agents/` against `tmux list-panes -a`
   and remove entries for panes that no longer exist. This also applies
   after normal (non-crash) lane cleanup — see the note below.
5. Audit all open PRs for redundancy against `main`, not just merge
   conflicts. A crash can leave an agent's work already landed through one
   path while its own PR is still open — rebase each PR branch onto `main`
   locally and check `git diff --stat`; an empty diff means the content
   already landed elsewhere and the PR should be closed as redundant, not
   merged.

### A lane cannot fully close itself out

An agent instructed to "close out this lane once merged" (per the
merge/cleanup policy) can get most of the way there on its own — merging
the PR, deleting the now-merged branch from other worktrees, removing
worktrees it created for its own use (e.g. a scratch verify checkout) —
but it reliably stops short of the very last step: removing its **own**
active worktree/window. That operation is self-referential (it would be
asking workmux to tear down the window the command is running in) and
gets silently skipped in favor of a "wrapped up, all done" summary
message instead of an error.

Don't take a lane's own "I've closed everything out" summary as proof the
worktree is actually gone. After it reports done, check from *outside*
that pane:

```bash
git worktree list          # is the lane's own worktree still here?
workmux list                # does its branch/window still show up?
```

If so, finish it from the parent/orchestrating session, the same way as
any other merged lane: `workmux rm <handle> -f`, then remove the now-dangling
`~/.local/state/workmux/agents/tmux__*.json` file for that pane per the
recovery steps above.

### Babysitting a long-running dispatched agent's permission prompts

When a lane (or a background sub-agent it dispatches, e.g. for
independent verification) runs many multi-step shell commands under
`--permission-mode acceptEdits`, compound `cd && ...` commands and some
individual tools still stop for interactive approval. Watching for these
by hand-writing a one-off polling loop against raw `tmux capture-pane`
text is tempting but has broken the same three ways every time it's been
tried live:

1. Exact-string matches for a status phrase (e.g. "Waiting for 1
   background agent to finish") miss it when the terminal wraps it
   across two lines — leading to false "it's finished" conclusions while
   the task is still genuinely running.
2. Content-hash dedup (to avoid re-approving the same visible prompt on
   every poll) gets defeated by volatile text captured in the same
   screen — elapsed-time counters, token counts, spinner glyphs — which
   changes every few seconds and makes every poll look like a "new"
   prompt, causing the same single prompt to be approved (or flagged)
   dozens of times a few seconds apart.
3. Trying to infer task *completion* from free-form TUI status text is
   inherently unreliable — prefer an authoritative external signal
   (`gh pr view --json state`, `git log origin/main`) over parsing
   scrollback.

Use `scripts/watch-and-approve.sh <pane-id> [max-seconds]` (in this
skill's directory) instead of writing a new one-off loop — it fixes all
three: it flattens wrapped lines before matching, uses an edge-triggered
state machine (act only when a prompt newly *appears*, never again while
the same one is still visible) instead of content hashing, and does not
attempt to detect completion at all. Confirm completion yourself from an
authoritative source once the script's approvals stop being needed, then
stop it.

It auto-approves anything that doesn't match its denylist (destructive
git/gh operations, `sudo`, etc. — see the script for the exact list) and
prints a line for every prompt it acts on or flags, so it's safe to run
under the Monitor tool.

### `npm run build` fails with "Symlink ... points out of the filesystem root"

Fixed by ADR 0043 (issue #93): `next.config.ts` computes `turbopack.root`
dynamically (`src/lib/turbopack-root.ts`) so Turbopack tolerates the
symlinked `node_modules` every non-main worktree gets from
`.workmux.yaml`'s `files.symlink`. `npm run build` should succeed
unmodified from inside any worktree — if this error reappears, check
`next.config.ts` still sets `turbopack.root` before assuming a fresh
workaround is needed.

### `/merge` cleans up the worktree even when the push silently failed

`/merge`'s cleanup (removing the worktree, branch, and tmux window) can
proceed even when the underlying push to `main` was rejected — most
commonly because `main` is a protected branch requiring PRs and status
checks, which a direct push bypasses. No error surfaces in the agent's own
output; the only symptom is that local `main`'s shared ref (visible across
every worktree, since they share refs) ends up ahead of `origin/main` with
an unpushed commit, while the PR that was supposedly merged is still open
on GitHub.

Always verify the commit actually reached `origin/main` after any `/merge`,
before treating the lane as done:

```bash
git fetch origin main --quiet
git log --oneline origin/main -3   # does it have the commit /merge claimed to land?
```

If it doesn't, recover by merging through GitHub directly instead of
trusting `/merge`'s own push:

```bash
# 1. Rebase the PR branch onto current origin/main in a scratch clone
#    (don't do this in the lane's own worktree or the main worktree)
git clone --quiet <repo-path> /path/to/scratch
cd /path/to/scratch
git fetch origin main <pr-branch>
git checkout -B <pr-branch> origin/<pr-branch>
git rebase origin/main
git push origin <pr-branch> --force-with-lease

# 2. Wait for CI to re-run on the rebased commits, then merge via gh directly
gh pr merge <n> --rebase --delete-branch

# 3. Sync local main and clean up the now-stale worktree manually
git -C <main-worktree-path> fetch origin main --quiet
git -C <main-worktree-path> reset --hard origin/main
workmux remove <handle> -f
```

## Configuration

Two levels: global (`~/.config/workmux/config.yaml`) and project
(`.workmux.yaml`). Project overrides global.

### Key options

```yaml
agent: claude                    # default agent for <agent> placeholder
merge_strategy: rebase           # merge, rebase, or squash
mode: window                     # window or session

panes:
  - command: <agent>             # <agent> resolves to configured agent
    focus: true
  - split: horizontal            # second pane with shell

files:
  copy:
    - .env                       # copy from main worktree
  symlink:
    - node_modules               # symlink from main worktree

post_create:
  - '<global>'                   # include global hooks
  - npm install                  # project-specific setup

base_branch: develop             # default base for new worktrees
window_prefix: wm-               # tmux window name prefix
```

Use `'<global>'` in project config arrays to include global values.

For the full configuration reference with all options documented, run
`workmux config reference`.

### Agent detection

Built-in agents (`claude`, `gemini`, `codex`, `opencode`, `kiro-cli`,
`vibe`) are auto-detected in pane commands and receive prompt injection
automatically. The `<agent>` placeholder resolves to the configured agent.

## Common Workflows

### Finishing work: direct merge

Use `/merge` to commit, rebase onto the base branch, and merge in one
step. This cleans up the worktree, tmux window, and branch.

### Finishing work: PR-based

1. Commit changes
2. `git push -u origin HEAD`
3. Use `/open-pr` to write a PR description and open in browser
4. After PR is merged remotely, clean up with `workmux rm --gone`

### Delegating tasks

Use `/worktree` to spin off tasks into parallel worktree agents. The
agent writes a prompt file and runs `workmux add -b -P <file>`.

For full lifecycle orchestration (spawn, monitor, merge), use
`/coordinator`.

### Pre-assigning ADR/decision-record numbers for a same-batch dispatch

If multiple lanes are being dispatched together and more than one is likely
to write a new ADR (or any other sequentially-numbered decision record this
repo uses), do not rely solely on each lane re-checking "is this number free
on `origin/main`?" before it commits — that check only catches a collision
against work that has *already landed*. It cannot catch a race between two
lanes dispatched in the same batch, since both will see the same "next free"
number if they check before either has committed. This happened on every
multi-lane batch in practice, not occasionally.

Instead, when writing the prompt files for a batch, compute the current max
ADR number once (`git ls-tree origin/main --name-only -- docs/adr | sort -t/
-k2 -n | tail -1`) and assign each lane in the batch a distinct number
directly in its prompt (e.g. "use ADR 0059 for your decision — this number is
reserved for you specifically because lanes X and Y in this same batch are
also adding ADRs"). Each lane's own build-time re-check against `origin/main`
remains valuable as a second safety net against *other*, differently-timed
work landing in between — keep instructing lanes to do that — but it is not a
substitute for upfront assignment within one batch.

### Cross-project worktree creation

`workmux add` creates worktrees in the current git repo and adds the
window to the current tmux session. To create a worktree in a different
project, run `workmux add` inside that project's tmux session.

Discover project paths from existing sessions:

```bash
tmux list-sessions -F '#{session_name} #{session_path}'
```

Then create the worktree in the target session:

```bash
# If the session exists:
tmux new-window -t <session> -c <project-path> \
  "workmux add <branch> -b -P <prompt-file>; exit"

# If the session does not exist, create it first:
tmux new-session -d -s <session> -c <project-path> && \
tmux new-window -t <session> -c <project-path> \
  "workmux add <branch> -b -P <prompt-file>; exit"
```

The temporary window closes when `workmux add` finishes; the worktree
window that workmux creates stays in the session.

Do NOT research before dispatching. Use context you already have, but
do not explore or read code just to write the prompt. Worktree agents
can read files from other projects via absolute paths, so reference
other projects by path and let the agent explore on its own.

## Related skills

This skill refers in places to companion skills that are **not** included in
this repo: `/merge`, `/rebase`, `/worktree`, `/coordinator` and `/open-pr`. Where
they are mentioned, do the step by hand instead. Nothing here depends on them.
