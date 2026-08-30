# Spec & Plan: Model system overhaul — effort, context tracking, cache hit

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-model-system` |
| **Status** | `implemented` |
| **Branch** | `feat/model-system` (branched from `feat/tui-overhaul`, unmerged — same working tree continuity) |
| **Related** | [IMPROVEMENTS](../../docs/IMPROVEMENTS.md) § 1.2, 1.3, 3.2, 3.4 · [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

---

## 1. Problem / Motivation

Four user-reported problems plus IMPROVEMENTS backlog items that live in the same surface:

1. **Effort may not work:** `api.js` sends `reasoning_effort` unconditionally, including values the API doesn't accept (`min`, `max`, `none` — OpenAI-compatible APIs accept only `low|medium|high`) and for models without reasoning support (silent 400s or ignored parameter). There is no way to know if it took effect.
2. **Context tracking looks wrong:** before the first API response the status bar shows a char-based estimate (`chars / 3.7`) with no distinction from measured values, and `getContextLimit()` hardcodes stale windows (e.g., gemini-2.5-pro as 2M — actual 1M).
3. **Cache hit at 89.3% can be better:** `runAgent` rebuilds the system prompt **every turn** (`buildSystemPrompt` + workspace filesystem snapshot) and overwrites `messages[0]`. When the agent creates files mid-session, the directory tree inside the system prompt changes → prefix changes → provider cache invalidates from position 0 → full-cache-miss turns.
4. **Model knowledge scattered:** prices/context hardcoded in `agent.js` conditionals (stale — IMPROVEMENTS § 3.2).

## 2. Goal

Single source of truth for model metadata (`src/models.js`); correct, capability-gated effort; honest context tracking (measured vs estimated); a byte-stable conversation prefix for maximal cache hits; and the IMPROVEMENTS items in the same surface (§ 1.2 stream errors, § 1.3 Retry-After, § 3.4 readFile cap).

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-----------|----------|
| RF-S01 | New `src/models.js`: `MODEL_INFO` table (match pattern, context window, input/output price per 1M, `reasoning` capability) + `getModelInfo(model)` with a safe default; `calculateCost`/`getContextLimit` consult it | Must |
| RF-S02 | Effort normalization: map `min`→`low`, `max`→`high`; send `reasoning_effort` **only** when the model declares `reasoning`; `none` omits the parameter entirely | Must |
| RF-S03 | Context honesty: status bar prefixes `~` when showing the pre-call char-based estimate (factor corrected to `/4`) vs raw numbers for measured API usage; context limit from MODEL_INFO | Must |
| RF-S04 | Cache stability: system prompt built **once per `(plansMode, skills)` session key** and reused across turns — never rebuilt mid-session even when workspace files change; documented trade-off (snapshot frozen until mode/skill change) | Must |
| RF-S05 | Cache visibility: accumulate `cached_tokens` from usage (`prompt_tokens_details.cached_tokens` / `cache_read_input_tokens` fallbacks); session bar shows `cache: N%` when available; `/cost` shows cached tokens + hit rate | Should |
| RF-S06 | IMPROVEMENTS § 1.2: mid-stream failures print the error message (partial reasoning/text already renders today, but silently) | Must |
| RF-S07 | IMPROVEMENTS § 1.3: retry delay honors `Retry-After` header (seconds or HTTP-date), falling back to the current backoff | Must |
| RF-S08 | IMPROVEMENTS § 3.4: `readFile` caps every model at 2000 lines with an explicit truncation notice pointing to `startLine`/`endLine` (replaces the free-only 300-line cap) | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Medium — changes API request bodies (effort param) and session state; no tool-handler/security-surface changes |
| **Negative criteria** | (1) `reasoning_effort` never sent to models without reasoning capability; (2) frozen system prompt must not leak stale plans-mode guidelines into build sessions (key includes mode); (3) readFile cap must not break `startLine`/`endLine` ranged reads |

## 5. Out of Scope

- IMPROVEMENTS § 1.1 (editFile ambiguity), § 1.4 (key per provider), § 1.5 (undo cap), § 2.x, § 3.1 (test suite), § 3.3 (`engines`) — separate specs/branches
- Provider wizard catalog refresh (labels stay; metadata comes from MODEL_INFO)

## 6. Acceptance Criteria

- **AC-01:** `getModelInfo('google/gemini-2.5-pro').context === 1048576`; `calculateCost` uses table prices; unknown models get the safe default (128000, 3/15). ✅ Unit script (12/12 PASS)
- **AC-02:** Given `effort='max'` on a reasoning-capable model, the body carries `reasoning_effort: 'high'`; non-reasoning models never receive it. ✅ Capability flags verified (`o3` true, `gpt-4o` false); gating inspected in `createChatCompletion`
- **AC-03:** Status bar prefixes `~` only for the pre-call estimate. ✅ `isEstimated = !stats.lastPromptTokens`
- **AC-04:** System prompt reused across turns for the same session key. ✅ Module-level `_cachedSystemPromptKey`
- **AC-05:** Session bar shows `cache: N%`; `/cost` prints cached tokens + hit rate. ✅ Code inspection + harness render
- **AC-06:** Retry-After honored. ✅ Unit test: seconds → 7000ms; HTTP-date → delta; fallback → attempt × 1500
- **AC-07:** Mid-stream error prints `✗ Stream error: <message>`. ✅ Code inspection
- **AC-08:** readFile caps at 2000 lines on any model; ranged reads unaffected. ✅ Cap applied only on the uncapped path
- **AC-09:** `node --check` all touched files ✅ · render harness unchanged ✅

## 7. Risks and Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frozen workspace snapshot shows outdated tree in long sessions | Low | Documented trade-off; changing plans mode/skills rebuilds. Correctness preserved by Read-Before-Write protocol |
| Model metadata goes stale | Medium | Single table in `models.js` — one place to update; values flagged as best-effort in comments |
| Cached-token field absent on some providers | Low | Defensive optional chaining; UI hides cache % when absent |
