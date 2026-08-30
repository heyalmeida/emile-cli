# Plan: Terminal UI premium pass (minimal, Claude-Code-grade)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-tui-premium` |
| **Status** | `approved` |

---

## 1. Technical Approach

Rendering-layer changes in `src/ui.js` + small call-site changes in `src/agent.js` and `src/cli.js`:

- **Palette** (`ui.js`): add `C.gold` (#FFD700) and `C.ghost` (#3B4261) tokens; grep/find tone changes from `purple` to `gold`. The source analysis's 256-color codes are adapted to the existing true-color system (ADR-0001/visual identity: one palette, one source of truth).
- **Tool lines** (`printToolSummary`): replace the pass-1 box with grid-aligned single lines — bullet + lowercase label padded to 8 chars in the tone color, dim args truncated to the terminal width; `formatToolSummary` gains short lowercase labels (`read`, `exec`, `plan`…) and the `tone` field already exists.
- **Status footer** → **response header**: remove `printToolsDone` (function + all call sites); add a module-level `_toolsRunThisTurn` counter incremented by `printToolSummary` and consumed by `printAssistantResponse`, which prints a dim `↳ N tools` line above the box and resets it; `printUserMessage` also resets it (new turn).
- **Thinking**: collapsed becomes the default (`config.expandThinking === true` means expanded). Stream: collapsed shows a static ghost `··· thinking` line that `endThinkingStream` replaces with `··· thought Ns`; expanded keeps the pass-1 muted live text. Non-stream `printThinking`: same two modes. Toggle logic in `cli.js` and `ui.js` (Ctrl+P) updated to the new default; toggle message reflects the actual mode.
- **User message divider** (`printUserMessage`): `── <message> ──────` in muted/fg, truncated; resets the tool counter.
- **Response box** (`printAssistantResponse`): max width 88 (keeps inner padding + bold accent label).
- **GAP constants**: exported from `ui.js` and used by the touched components.
- **Harness** (`test-ui.js`): updated to the new output (tool lines, ghost thinking, divider, `↳` header, 88-col box).

## 2. Architectural Compliance

- **ADR-0001:** compliant — no new dependencies, no build step, raw ANSI.
- **Architecture doc:** compliant — UI isolated in `ui.js`; `agent.js` only drops the `printToolsDone` call.
- **Design system:** this pass *updates* `docs/visual-identity.md` (tool lines replace the tools box; thinking ghost + collapsed default; divider; 88-col measure; gold token) — synced at closing.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no handler changes |
| File writes and `resolveSafePath` | Not applicable |
| LLM inputs (prompt injection / tool args) | Tool args only rendered (truncated); sanitized content path unchanged |
| Secrets | Not applicable — no new output path |
| Controls and negative tests | ANSI resets; truncation below 60 cols; thinking redraw confined to its own line |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| UI rendering | `src/ui.js` | Palette tokens, tool lines, `↳` header, thinking ghost/default, divider, box width, GAP |
| Agent loop | `src/agent.js` | Remove `printToolsDone` import/call |
| REPL | `src/cli.js` | `/thinking` toggle logic + message for the new default |
| Harness | `test-ui.js` | Updated render script |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/thinking` | Default now collapsed; expansion is opt-in |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------------------|-------------|
| Modify | `src/ui.js` | All components above |
| Modify | `src/agent.js` | Drop tools-done footer |
| Modify | `src/cli.js` | Toggle logic |
| Modify | `test-ui.js` | Harness update |
| Modify | `docs/visual-identity.md`, `docs/roadmap.md`, `CHANGELOG.md`, `features/terminal-ui.md`, `README.md` | Closing sync |

## 7. Technical Decisions (summary)

1. **True-color adaptation of the source palette:** `gold` = #FFD700 (Option A), `ghost` = #3B4261 (Tokyo Night blue0 — "almost invisible" on dark backgrounds). 256-color codes from the analysis are not used directly.
2. **Collapsed thinking keeps a one-line ghost trace** (`··· thought Ns`) instead of being erased entirely — preserves the pass-1 rhythm (exactly one line between the user message and the response box) and still tells the user reasoning happened.
3. **`↳ N tools` lives above the response box** (not after the tools) because diffs print during execution — a footer right after the tool lines would be separated from the summary by the diff blocks anyway.
4. **Counter in `ui.js` (not `agent.js`)** so history replay (which calls the same components) stays consistent for free.
5. **Divider replaces the `❯ message` format** — the user message becomes the visual chapter marker, per the source analysis.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01/02/03/05/06 | Harness render at 80 and 60 columns |
| AC-04 | Code inspection of both toggle sites + harness of both modes |
| AC-07 | Harness + ANSI-reset scan |
| AC-08 | `node --check` on all touched files |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/tui-overhaul` (continues — same terminal-UI feature, pass 1 not yet merged) |
| **Commit plan** | (1) spec/plan/tasks + ui-premium input; (2) ui.js premium pass (tool lines, ghost thinking, divider, box width, `↳` header, palette, GAP) + agent.js/cli.js call sites; (3) harness; (4) docs sync |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling | Unchanged |
| Interruption / readline | Unchanged (collapsed thinking writes exactly one line, erased with `\r\x1B[2K` + rewrite — no cursor-up math needed) |
| Partial state | Tool counter is display-only |
| Rollback | Revert the pass-2 commits |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Users expect expanded thinking by default | Medium | `/thinking`/Ctrl+P opt-in documented in CHANGELOG/README |
| Ghost color invisible on very dark/light themes | Low | It is intentionally near-invisible; expanded mode remains fully readable |
| `↳ N tools` missed when a turn ends with tool calls and no text | Low | Counter resets on the next user message; the summary is informational, not contractual |
