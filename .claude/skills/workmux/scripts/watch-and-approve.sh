#!/bin/bash
# Watch a workmux/tmux pane running an interactive `claude` session and
# auto-approve permission prompts that match a safe allowlist, flagging
# anything else instead of guessing.
#
# Why this exists: hand-rolled one-off polling loops against raw
# `tmux capture-pane` text kept breaking the same three ways —
# (1) exact-string matches missed prompts wrapped across lines by the
#     terminal, (2) content-hash dedup was defeated by volatile text in
#     the same capture (elapsed timers, token counters, spinner glyphs),
#     which change every poll and made every prompt look "new", causing
#     the same prompt to be re-approved (or re-flagged) dozens of times
#     a few seconds apart, and (3) trying to infer task *completion* from
#     free-form TUI status text produced false "it's done" positives
#     while the task was still genuinely running.
#
# This script fixes all three: it flattens wrapped lines before matching,
# uses an edge-triggered state machine (act only when a prompt newly
# appears, never while the same one is still visible) instead of content
# hashing, and does NOT try to detect task completion at all — confirm
# completion from an authoritative source (`gh pr view`, `git log`, the
# lane's own final message) rather than from scraped terminal text.
#
# Usage:
#   watch-and-approve.sh <tmux-pane-id> [max-seconds]
#
# Exits after max-seconds (default 3600) or when the pane no longer
# exists. Stop it earlier (Ctrl-C, or TaskStop if run via Monitor) once
# you've independently confirmed the work is done.
#
# Every prompt it acts on is printed to stdout as one line — safe to run
# under the Monitor tool, where each stdout line becomes a notification.

set -u

PANE="${1:?usage: watch-and-approve.sh <tmux-pane-id> [max-seconds]}"
MAX_SECONDS="${2:-3600}"
POLL_INTERVAL=4

# Commands that must NEVER be auto-approved, however this list is phrased
# elsewhere. Extend this before relying on the script for a new kind of
# task — err on the side of adding a pattern, not removing one.
DANGEROUS_RE='rm -rf|--force\b|--hard\b|force-with-lease|force_with_lease| -D |drop table|DROP TABLE|gh pr merge|gh repo delete|workmux rm|workmux merge|sudo |chmod 777|npm publish|git push origin main|git push --force|git clean|truncate|DELETE FROM|reset --hard'

# Claude Code's permission prompts all start a line with this, regardless
# of the specific action ("proceed?", "make this edit to X?", "create
# Y?", "delete Z?", ...). Matching the stable prefix instead of
# enumerating every phrasing is what makes this robust to prompt wording
# that hasn't been seen yet.
PROMPT_RE='^ *Do you want to'

elapsed=0
prompt_was_visible=false

while [ "$elapsed" -lt "$MAX_SECONDS" ]; do
  raw=$(command tmux capture-pane -p -t "$PANE" -S -200 2>/dev/null)
  if [ -z "$raw" ]; then
    echo "Pane $PANE no longer exists - stopping"
    exit 0
  fi

  if echo "$raw" | grep -qiE "$PROMPT_RE"; then
    if [ "$prompt_was_visible" = false ]; then
      prompt_was_visible=true
      snippet=$(echo "$raw" | tail -30)
      if echo "$snippet" | grep -qiE "$DANGEROUS_RE"; then
        echo "NEEDS REVIEW - not auto-approving, matched a denylisted pattern:"
        echo "$snippet"
      else
        echo "Auto-approving:"
        echo "$snippet" | tail -12
        command tmux send-keys -t "$PANE" "1" Enter
      fi
    fi
    # Same prompt still visible on a later poll (approval not yet
    # processed, or this one is a NEEDS REVIEW we deliberately left
    # alone) - do nothing until it changes. This is what a hash-based
    # dedup was trying and failing to do; an edge-triggered flag isn't
    # fooled by timers/spinners ticking elsewhere in the same capture.
  else
    prompt_was_visible=false
  fi

  sleep "$POLL_INTERVAL"
  elapsed=$((elapsed + POLL_INTERVAL))
done

echo "Reached max-seconds ($MAX_SECONDS) without the pane closing - stopping. Re-run if the task is still going."
