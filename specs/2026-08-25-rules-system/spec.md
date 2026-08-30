# Spec & Plan: Project rules system (`.emilerules`)

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-rules-system` |
| **Status** | `implemented` |
| **Branch** | `feat/rules-system` |
| **Related** | [.clinerules](../../.clinerules) (Cline/Codex rules), [Architecture](../../docs/architecture.md) |

---

## 1. Problem / Motivation

Emile has no native way to honor per-project **rules** — the constraints a project owner wants enforced on every session (like `.clinerules` does for Cline/Codex, `AGENTS.md` for Codex, `.cursorrules` for Cursor). Rules are higher-authority than skills: they are always-on, not keyword-triggered. Without native support, an emile user's project guidance is simply ignored.

## 2. Goal

Load and inject **user-authored project rules** into the system prompt: a dedicated, optional `.emilerules` file created by the user, with a compatible fallback chain (`AGENTS.md`, `.clinerules`, `.cursorrules`) for existing user-maintained project guidance; a size cap with truncation notice; a `/rules` slash command to inspect what's active; and a verbose startup line. Emile never generates or ships preference content on the user's behalf.

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-----------|----------|
| RF-S01 | New `src/rules.js`: discovery (`.emilerules` → `AGENTS.md` → `.clinerules` → `.cursorrules`), read with `MAX_RULES_CHARS` (12k) cap + truncation notice, mtime-based cache | Must |
| RF-S02 | `prompt.js` injects a `=== PROJECT RULES (...) ===` section right after environment context — part of the frozen per-session prefix (cache-stable) | Must |
| RF-S03 | `/rules` slash command: shows active file, path, truncation state and content in the CLI | Must |
| RF-S04 | Verbose startup line: `[rules] active: <file> (<chars> chars)` | Should |
| RF-S05 | Rules remain opt-in and user-owned: Emile never creates a default `.emilerules`; when none exists, `/rules` explains how the user can create one from their own preferences | Must |

## 4. Risk / Security

- Rules content is **local user-controlled config** (same trust model as `.clinerules`); injected verbatim into the system prompt — no path/command execution.
- No rules file is written by the CLI. Discovery is read-only and never replaces user preferences with built-in defaults.
- Candidate symlinks that resolve outside the workspace are ignored, preventing an apparently local rules filename from exfiltrating an external file into the model prompt.
- `/rules` strips terminal control sequences before rendering file content, preventing ANSI/OSC injection.
- Size cap prevents a huge file from bloating every request.
- Cache-stable: once built into the frozen prompt, rules changes take effect on a new session (same behavior as plans mode/skills).

## 5. Acceptance Criteria

- **AC-01:** With a `.emilerules` at the workspace root, `loadRules()` returns it (precedence over the fallback chain `.clinerules`/`AGENTS.md`/`.cursorrules`); `formatRulesBlock` injects the section with the resolved filename as label.
- **AC-02:** A file over 12k chars is truncated with a notice.
- **AC-03:** `/rules` prints the active file, path and content; with none, prints a helpful message listing the fallback chain.
- **AC-04:** `buildSystemPrompt()` includes the rules section; the frozen-prefix mechanism still warns `[rules] active` in verbose startup.
- **AC-05:** With no user-authored rules file in a workspace, Emile injects no rules block and `/rules` explains how to create `.emilerules`; the repository does not ship a default `.emilerules`.
- **AC-06:** Syntax checks + harness + focused rules tests and CLI smoke checks pass.
- **AC-07:** A supported filename symlinked outside the workspace is rejected, and terminal control sequences in `/rules` output are stripped.

## Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `node --test test/rules.test.js`: `.emilerules` wins over `.clinerules`; formatted block asserted |
| AC-02 | ✅ | Focused test verifies exactly 12k is preserved and 12k+1 is truncated with notice |
| AC-03 | ✅ | `/rules` dispatch, autocomplete and help registered; inactive rendering covered through the pure inactive result and UI source inspection |
| AC-04 | ✅ | Prompt integration script found the active `AGENTS.md` block; verbose startup path syntax-checked |
| AC-05 | ✅ | Root `.emilerules` absent/untracked; no-file test injects no block and help copy is user-owned/opt-in |
| AC-06 | ✅ | `node --check` on all touched JS; `node --test`; `node bin/emile.js --help`; `node test-ui.js`; direct `runAgent` smoke returned `OK` and cost `0.02259` |
| AC-07 | ✅ | Focused tests reject an external symlink and strip OSC/CSI/CR terminal controls |
