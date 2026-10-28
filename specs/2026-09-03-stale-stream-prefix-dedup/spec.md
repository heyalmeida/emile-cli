# Spec: Deduplicate stale stream snapshots

| Field | Value |
|-------|-------|
| **ID** | `2026-09-03-stale-stream-prefix-dedup` |
| **Status** | `implemented` |
| **Phase/Context** | Agent stream normalization |
| **Related documents** | [streaming integrity](../2026-08-30-streaming-input-integrity/spec.md), [reasoning display](../2026-08-30-reasoning-details-display/spec.md), [architecture](../../docs/architecture.md) |

## 1. Problem / Motivation

`output-logs.txt` contains the same reasoning paragraphs repeated many times, and the same text also appears to be repeated in the final response. This is not consistent with a normal provider delta stream. The current `getIncrementalText()` normalizer handles equal snapshots, cumulative snapshots and suffix overlap, but it does not recognize a stale snapshot that is a shorter prefix of the already accumulated text.

For example, after accumulating `The user asks`, receiving a later snapshot `The user` is treated as new text because it is not equal to the accumulated value, is not a suffix, and does not start with the accumulated value. The stale prefix is appended and the repetition grows on every redraw/final history update.

## 2. Goal

Treat shorter snapshots that are already a prefix of the accumulated stream as stale, prevent repeated reasoning and response content, and preserve legitimate new deltas and longer cumulative snapshots.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | A shorter incoming snapshot that is a prefix of the accumulated text MUST produce no new text. | Must |
| RF-S02 | The same stale-prefix rule MUST apply to legacy reasoning, response content and structured `reasoning_details`. | Must |
| RF-S03 | Ordinary token deltas, longer cumulative snapshots, suffix duplicates and existing overlap handling MUST remain unchanged. | Must |
| RF-S04 | The final assistant history and rendered output MUST contain each received text fragment at most once. | Must |
| RF-S05 | No change to provider requests, tools, sessions, terminal layout or model configuration. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes the stream normalization contract used by the agent loop. |
| **Assets/secrets** | No new persistence or secret surface. |
| **Command execution / file writes** | Not applicable; no tool or file boundary changes. |
| **Untrusted inputs** | Provider text remains untrusted model output; only deduplication behavior changes. |
| **Negative criteria** | Do not drop a genuinely new suffix, do not concatenate stale snapshots, do not modify structured encrypted reasoning, and do not hide final content from history. |

## 5. Out of Scope

- Replacing the provider stream with a non-streaming request.
- Changing the ANSI renderer or prompt arbitration.
- Adding semantic hallucination detection.
- Changing model prompts or reasoning effort.

## 6. Acceptance Criteria

- **AC-01:** Given accumulated `The user asks` and incoming `The user`, normalization returns an empty delta.
- **AC-02:** Given structured reasoning with the same id receiving a longer snapshot and then a stale shorter prefix, the preserved block and display contain the longer text once.
- **AC-03:** Given ordinary deltas (`Hello`, ` world`, `!`), normalized output is `Hello world!`.
- **AC-04:** Given a stream that repeats a stale prefix for reasoning and content, `runAgent()` history contains no repeated paragraphs and the focused regression test passes.
- **AC-05:** Syntax, lint and the relevant full regression surface pass; `output-logs.txt` is not modified.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-----------------|
| A legitimate new fragment may equal a prefix of prior text. | Low/medium | The existing suffix-deduplication behavior already treats repeated short fragments conservatively; add explicit tests and keep the rule limited to strictly shorter snapshots. |
| Provider sends genuinely out-of-order text. | Medium | Do not invent missing text; only suppress a value already contained as a prefix. |
| Visual duplication may coexist with parser duplication. | Medium | Fix the proven history-level prefix bug first, then re-capture the log and compare exported history. |

## 8. References

- `output-logs.txt` — reproduced repeated reasoning/final text.
- `src/agent/reasoning.js` — `getIncrementalText` and structured reasoning merge.
- `src/agent/agent.js` — stream accumulation and history creation.
- `test/reasoning.test.js` — existing cumulative/overlap coverage.
