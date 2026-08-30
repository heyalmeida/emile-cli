# Spec: Dynamic terminal title by runtime activity

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-dynamic-terminal-title` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 1 — Terminal UI continuity |
| **Branch** | `feat/dynamic-terminal-title` |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

---

## 1. Problem / Motivation

The terminal tab title does not communicate what Emile is doing. During long reasoning, context compression or tool chains, users must open the tab to distinguish an active session from an idle one. A partial title implementation also relied on raw session summaries and raw tool names, which were less informative and unnecessarily exposed prompt text.

## 2. Goal

Keep the terminal title synchronized automatically with Emile's real runtime state: starting, connecting, waiting, thinking, responding, compressing context and executing a human-readable tool activity. The agent loop uses a UI function directly; no model-facing tool or extra LLM call is introduced.

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | Add `src/ui/title.js` with pure title sanitization/formatting, OSC emission gated by TTY support, stable identity (`emile`, workspace, model) and transient activity | Must |
| RF-S02 | CLI startup, MCP connection, model/session commands, idle state and shutdown update the title automatically | Must |
| RF-S03 | Agent loop updates `thinking`, `responding`, fallback and human-readable tool activities; context compression reports `compressing context` | Must |
| RF-S04 | Tool activity descriptions never expose tool arguments or command/query content; file tools may show only a shortened sanitized path | Must |
| RF-S05 | Unexpected agent errors always return the title to `waiting`; non-TTY and `TERM=dumb` environments emit no OSC sequence | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | High: user/model-controlled strings reach an OSC terminal control boundary. |
| **Assets/secrets** | Prompt text, tool arguments, commands and search queries must not be copied into the title. |
| **Command execution / file writes** | No execution/write behavior changes; title updates observe already-authorized runtime states only. |
| **Untrusted inputs** | Model IDs, workspace/path strings and MCP tool names are stripped of ANSI/OSC/control bytes, whitespace-normalized and length-capped. |
| **Negative criteria** | No raw prompt/session summary, file content, shell command, grep query or arbitrary OSC reaches the terminal title; no output in non-TTY/dumb terminals. |

## 5. Out of Scope

- A model-facing `setTitle` tool. Runtime state is deterministic and must not spend tokens or depend on model compliance.
- User-configurable title templates or a CLI flag.
- Restoring the shell's previous title, which terminals do not expose portably.

## 6. Acceptance Criteria

- **AC-01:** Given a supported TTY, runtime state changes produce bounded OSC titles in the form `<activity> · emile · <workspace> · <model>`.
- **AC-02:** Thinking, responding, compression and every built-in tool category have automatic human-readable activity labels; MCP/unknown tools degrade to a sanitized generic label.
- **AC-03:** A title input containing ANSI, OSC, BEL, CR or newlines cannot inject a second escape/control sequence.
- **AC-04:** `runCommand` and search activities reveal no argument content; no user prompt/session summary is used in the title.
- **AC-05:** Non-TTY/`TERM=dumb` emission is a no-op, and the agent restores `waiting` in a `finally` path after success or failure.
- **AC-06:** Syntax checks, focused title tests, TUI harness and direct agent smoke pass without regressing cost tracking.

## 9. Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Focused formatting + fake-TTY emission tests assert activity-first OSC output and 100-char maximum |
| AC-02 | ✅ | Built-in/MCP mapping tests plus injected compression completion; CLI/agent lifecycle source paths syntax-checked |
| AC-03 | ✅ | OSC/CSI/BEL/CR/newline injection test leaves one bounded OSC sequence only |
| AC-04 | ✅ | Tests assert command/search secrets are absent; implementation has no prompt/session-summary API |
| AC-05 | ✅ | Non-TTY/dumb tests are no-ops; unexpected `runAgent` failure test restores `waiting` through `finally` |
| AC-06 | ✅ | All touched syntax checks, 7 focused tests, rules regression suite, `test-ui.js` and networked `openrouter/free` smoke passed; final title `waiting · emile · emile-cli · free`, cost 0 |

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Some terminals ignore OSC titles | Low | Silent best-effort behavior; no visible fallback noise. |
| Very rapid tool chains cause many title writes | Low | One short write per state transition; duplicate rendered titles are suppressed. |
| File paths disclose workspace structure in tab lists | Medium | Show at most the last two path components; never show file contents or arbitrary tool arguments. |

## 8. References

- Product/architecture documents consulted: README, PRD, architecture, visual identity, quality/security, glossary and ADR-0001.
- Related specs: `2026-08-25-tui-overhaul`, `2026-08-25-model-system`, `2026-08-25-project-structure`.
