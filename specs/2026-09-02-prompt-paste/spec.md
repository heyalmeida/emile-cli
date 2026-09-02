# Spec: Preserve pasted multiline prompts

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-prompt-paste` |
| **Status** | `implemented` |
| **Phase/Context** | REPL terminal UI / persistent prompt |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md) |

---

## 1. Problem / Motivation

Pasting text into Emile's idle prompt can treat the first pasted newline as an
Enter key and submit the draft immediately. A pasted list therefore sends only
its first item. This breaks the terminal-native task entry promised by RF-01
and the persistent writing field in RF-14.

## 2. Goal

Paste text, including multiple lines, into either the idle prompt or the prompt
shown while a turn is active without losing any line or sending the draft before
the user deliberately presses Enter.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|--------------------|
| RF-S01 | The idle persistent prompt enables bracketed-paste mode while it owns raw stdin and disables it during cleanup. | Must |
| RF-S02 | A bracketed pasted payload preserves all its lines as one editable draft; it must not invoke submission. | Must |
| RF-S03 | The active-turn queue accepts the same multiline pasted payload as one queued draft. | Must |
| RF-S04 | A normal Enter still submits the complete draft, including pasted newlines. | Must |
| RF-S05 | Escape, Ctrl+C, slash autocomplete and terminal cleanup retain their existing behavior. | Must |
| RF-S06 | `paste-start`/`paste-end` keypress events delimit a paste; any `Enter` received between them inserts a newline instead of submitting. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Low — terminal UI input lifecycle only; an error can lose user-entered text or leave a terminal mode enabled. |
| **Assets/secrets** | User prompt text may contain sensitive information; it must not be logged or exported by the new handling. |
| **Command execution / file writes** | Not applicable; the change does not touch tool gates or filesystem access. |
| **Untrusted inputs** | Pasted text is user input. It stays data in the draft and follows the existing submission sanitization boundary. |
| **Negative criteria** | Do not introduce dependencies, terminal output text, model calls, or a persistent terminal-mode leak after prompt cleanup. |

## 5. Out of Scope

- Clipboard integration beyond the terminal's standard bracketed-paste protocol.
- Changing the maximum length or content policy of queued active-turn prompts.
- Reworking prompt layout or cursor movement.

## 6. Acceptance Criteria

- **AC-01:** Given an idle prompt, when a bracketed payload containing a three-item list is pasted, then no submission occurs and all three lines remain in the editable draft.
- **AC-02:** Given that pasted draft, when the user presses Enter, then `onSubmit` receives the complete text with its newlines.
- **AC-03:** Given the active-turn prompt, when the same payload is pasted and then Enter is pressed, then `onLine` receives the complete text once.
- **AC-04:** Given either prompt has owned raw stdin, when it cleans up, then it emits the matching bracketed-paste disable sequence exactly once.
- **AC-05:** Existing prompt-render, active-turn visibility, syntax and full regression gates pass.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Older terminals may not implement the protocol. | They can retain their native paste behavior. | The protocol is negotiated best-effort; modern terminals receive deterministic multiline payloads without timing heuristics. |
| Terminal mode is not restored. | Subsequent applications see bracketed paste unexpectedly. | Each raw-input owner emits the disable sequence in its idempotent cleanup path and tests capture it. |

## 8. References

- `src/ui/prompt-input-persistent.js`
- `src/ui/turn-keys.js`
- `test/prompt-input-render.test.js`
- `test/turn-keys-visibility.test.js`
