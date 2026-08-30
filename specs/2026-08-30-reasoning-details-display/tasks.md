# Tasks: Reliable reasoning display across streaming formats

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-reasoning-details-display` |

## Phase 0 — Preparation

- [x] T0.1 — Read PRD, architecture, visual identity, code-quality/security, glossary, ADR-0001 and related TUI specs.
- [x] T0.2 — Confirm this spec and plan are `approved`.
- [x] T0.3 — Classify risk as Medium and map reasoning output, history and terminal-control surfaces.
- [x] T0.4 — Create/switch to `fix/reasoning-details-display`; preserve the pre-existing user changes and untracked helper script.

## Phase 1 — Implementation

- [x] T1.1 — Add typed structured-reasoning normalization and fragment merge *(AC-01, AC-02, AC-03, AC-07)*.
- [x] T1.2 — Integrate `reasoning_details` into the agent stream/history and unify the thinking toggle *(AC-03, AC-04, AC-06)*.
- [x] T1.3 — Finalize expanded stream headers as `Thought for Ns` without duplicate rendering *(AC-05)*.
- [x] T1.4 — Fix expanded renderer physical-line accounting and snapshot the mode at stream start *(AC-08)*.
- [x] T1.5 — Send OpenRouter's unified reasoning request object with effort mapping *(AC-09)*.
- [x] T1.6 — Make expanded reasoning the default while retaining the unified toggle *(AC-04, AC-10)*.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Run positive, negative, malformed, encrypted and no-reasoning fixtures *(AC-01, AC-02, AC-06, AC-07)*.
- [x] T2.2 — Run `node --check` on touched JS files, `npm test`, and the UI harness at 60/80 columns *(AC-04, AC-05)*.
- [x] T2.2a — Run API request mapping tests *(AC-09)*.
- [x] T2.3 — Confirm no new dependency; `npm audit` is not applicable.
- [x] T2.4 — Verify every acceptance criterion and record exact evidence below.
- [x] T2.5 — Verify the fresh-config default and update the render harness for the expanded-first flow *(AC-10)*.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync architecture, visual identity, feature registry, improvements backlog and changelog.
- [x] T3.2 — Revalidate Markdown/Mermaid links and syntax.
- [x] T3.3 — Set this spec status to `implemented`.
- [x] T3.4 — Commit only feature files in coherent implementation/docs commits.
- [x] T3.5 — Record limitations and non-executed checks in the handoff.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|---------|--------------------------------|
| AC-01 | ✅ | `test/reasoning.test.js` covers summary/text and the parser integration consumes legacy plus structured fields. |
| AC-02 | ✅ | Encrypted fixture preserves `data` but the returned display string excludes it. |
| AC-03 | ✅ | Normalizer merges fragments into the preserved structured block; agent attaches `assistantMessage.reasoning_details`. |
| AC-04 | ✅ | `cli.js` and `prompt-input.js` toggle only `config.expandThinking`; harness verifies expanded/collapsed paths. |
| AC-05 | ✅ | `node test-ui.js` output contains `Thought for 1s` after expanded streaming and no duplicate final block. |
| AC-06 | ✅ | Empty/malformed detail fixtures return no display text; implementation does not synthesize reasoning. |
| AC-07 | ✅ | Malformed fixture passes `assert.doesNotThrow`; unknown/encrypted fields are ignored for display. |
| AC-08 | ✅ | Harness output shows one `Thinking…` header row and rewrites it in place as `Thought for 1s` after multiple redraws. |
| AC-09 | ✅ | `test/api-client.test.js` confirms OpenRouter uses `reasoning`, maps `min` to `minimal`, and omits `reasoning_effort`; non-OpenRouter mapping remains covered. |
| AC-10 | ✅ | `test/reasoning.test.js` asserts the fresh configuration defaults to `expandThinking: true`; `test-ui.js` exercises the expanded-first flow. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `fbbd956` | `fix(reasoning): render structured streaming details` | Reasoning parser/API/UI, expanded-by-default behavior, tests, spec/docs and `REASONING_RENDER_FIX.md` |
| `8024176` | `docs(improvements): sync reasoning delivery status` | `IMPROVEMENTS.md` §7.4/§8.5 and changelog synchronization |

## Handoff Notes

- `openrouter/free` is a model router and may legitimately return no reasoning; this fix does not fabricate a thought trace or force a reasoning-capable route.
- Smoke limitation: `timeout 12s node bin/emile.js --verbose "respond with one short sentence"` reached the configured `mcp.json` server connection spinner and exited with code 124 before an API turn; `npm test` and the offline render harness passed.
