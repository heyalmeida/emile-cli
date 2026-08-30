# Spec & Plan: Project structure refactor — decompose monolithic modules

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-project-structure` |
| **Status** | `approved` → `implemented` |
| **Branch** | `feat/rules-system` (structural prep for the rules feature) |

## 1. Problem

Four modules concentrate multiple responsibilities and grew into monoliths:

| File | Lines | Responsibilities mixed |
|------|-------|------------------------|
| `src/ui.js` | ~1345 | theme/palette, ANSI+text utils, boxes, sanitizer, markdown renderer, tool summary, header, config panel, status bar, divider, response box, thinking stream, diff block, help, history replay, interactive prompt, session switcher |
| `src/tools.js` | ~500 | path security, command whitelist, tool schemas, 7 tool handlers, diff rendering, shared caches |
| `src/agent.js` | ~500 | session stats/cost/context math, history compression, agent loop |
| `src/api.js` | ~200 | provider client + retry policy (borderline; moves to domain folder) |

Small focused modules stay flat on purpose: `config.js`, `models.js`, `prompt.js`, `skills.js`, `plans.js`, `history.js`, `mcp.js`, `commands.js`.

## 2. Target layout

```
src/
├── cli.js                  # flags + REPL + slash dispatch (orchestrator)
├── config.js  models.js  prompt.js  skills.js  plans.js
├── history.js  mcp.js  commands.js        # focused leaf modules
├── rules.js                # (next feature)
├── agent/
│   ├── index.js            # barrel
│   ├── agent.js            # runAgent loop + free-model fallback
│   ├── session-stats.js    # sessionStats, cost/context math
│   └── compression.js      # history summarization gate
├── api/
│   ├── index.js            # barrel
│   └── client.js           # OpenAI-compatible client + retry
├── tools/
│   ├── index.js            # barrel
│   ├── security.js         # resolveSafePath + command whitelist
│   ├── definitions.js      # tool JSON schemas
│   ├── file-state.js       # read cache + undo stack
│   ├── show-diff.js
│   └── handlers/           # one file per built-in tool + index
└── ui/
    ├── index.js            # barrel (public API unchanged)
    ├── theme.js            # C palette, GAP, ANSI/text utils, measures
    ├── boxes.js  sanitize.js  markdown.js  spinner.js
    ├── header.js  config-panel.js  status-bar.js  user-message.js
    ├── response.js  thinking.js  tool-lines.js  turn-state.js
    ├── diff-block.js  help.js  history-replay.js
    └── prompt-input.js  switch-session.js
```

Old `src/ui.js`, `src/tools.js`, `src/agent.js` are **deleted**; all import sites migrate to the new paths. Behavior must be 100% identical (pure moves).

## 3. Requirements

- RF-S01: split `ui.js` into the `ui/` tree above; shared mutable state (turn tool counter) isolated in `turn-state.js`.
- RF-S02: split `tools.js` into `tools/` (security, definitions, state, per-handler files).
- RF-S03: split `agent.js` into `agent/` (loop, session stats, compression).
- RF-S04: move `api.js` → `api/client.js`; `spinner.js` → `ui/spinner.js`.
- RF-S05: zero behavior change — verified by harness + unit scripts + smoke gates.

## 4. Verification

- `node --check` on every `.js` file in `src/`
- Render harness (`test-ui.js`), model unit script, prompt simulator, catalog tests all pass with updated import paths
- `grep -r "from './ui.js'" src/` returns nothing

## Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| RF-S01..S04 | ✅ | Tree created; all import sites migrated; old monoliths deleted |
| RF-S05 | ✅ | node --check (all files) · test-ui harness · test-models 12/12 · test-prompt sim · test-catalog live · test-offline — all PASS |
