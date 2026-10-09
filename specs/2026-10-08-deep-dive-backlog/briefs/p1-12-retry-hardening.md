# BRIEF P1-12 — Retry hardening: jitter, 429 fast-surface, and a stream idle watchdog

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (resilience row), § 5.

## Goal

Three gaps in `src/api/client.js` (all facts verified 2026-10-09):

1. **No jitter** — `getRetryDelayMs` returns deterministic `attempt * 1500` (`:143`); every emile user behind the same gateway retries in lockstep (thundering herd against a rate limiter).
2. **429 burns the whole budget silently** — 3 attempts × fixed 10 s (`:142`), then one generic error line; grok surfaces a 429 to the user after ~2 internal attempts with the server's `Retry-After` (`grok: xai-grok-sampler/src/retry.rs:5, 130-143`).
3. **A stalled stream hangs the turn forever** — `streamWithRetries` (`:202-240`) awaits `for await (const chunk of responseStream)`; a gateway that stops yielding chunks WITHOUT closing the connection produces no chunk ⇒ no loop iteration ⇒ the cancel poll (`agent.js:450`) and any timeout never fire. The user must kill the process. grok has an explicit idle timeout (`IdleTimeout{elapsed_secs}`, `retry.rs:795-801`).

## Required design (do not re-derive; implement this)

1. **Jitter** in `getRetryDelayMs`: multiply the computed delay by `1 + (Math.random() * 0.4 - 0.2)` (±20%); keep honoring `Retry-After` first (jittered too, clamped to ≥ 0). Export stays the same; tests below mock `Math.random` or assert bounds.
2. **429 fast-surface**: inside `streamWithRetries` and the non-stream retry loop, track 429 occurrences; after the **2nd** 429, stop retrying and rethrow (the existing `formatApiError` path renders "Rate limited" — extend it to include the server `Retry-After` seconds when present).
3. **Idle watchdog**: `const STREAM_IDLE_MS = Number(process.env.EMILE_STREAM_IDLE_TIMEOUT_MS) || 120_000`. Implement as a per-chunk deadline: wrap the iterator's `next()` in `Promise.race([it.next(), idleTimer])`; on timeout, call `responseStream.return?.()` / abort the underlying request (the SDK call already accepts `{ signal }` — thread a dedicated `AbortController` per attempt, abort it on idle) and throw a classified error. **Before the first chunk** the error is retryable (existing policy); **after the first chunk** it surfaces as `formatApiError` text "Stream stalled — no data for Ns. Retrying the turn may help." and the turn errors gracefully (never hangs). The 120 s default must exceed normal thinking pauses for reasoning models — note in the JSDoc that `EMILE_STREAM_IDLE_TIMEOUT_MS` is the escape hatch.
4. Keep the "retry only before the first chunk" invariant (`:224`) — the watchdog is an additional trigger for the same classification, not a policy change.

## Tests to add (new file `test/api-retry-hardening.test.js`)

- `getRetryDelayMs` with mocked `Math.random` (0.5 → no shift; 0 and 1 → ±20% bounds asserted).
- 429 twice → third attempt not made (count `create` calls on a fake client; assert 2 + the error surfaces with Retry-After text).
- Idle: fake async-iterator client that yields one chunk then stalls; run with `EMILE_STREAM_IDLE_TIMEOUT_MS=50`; assert the call rejects within ~200 ms (not forever) and the error message mentions the stall.
- Idle before first chunk → retried (fake client: attempt 1 stalls, attempt 2 completes) — assert eventual success.
- All tests must pass on Windows (no POSIX-only timing assumptions beyond generous bounds).

## Constraints

- Do not change `MAX_RETRIES` for non-429 statuses, the retryable status/code sets (`:11-12`), or `formatApiError`'s redaction behavior.
- No new dependencies. The OpenAI SDK is 4.104 — `chat.completions.create(args, { signal })` is already the supported abort path (`:213, :306`).

## Verification

`node --check src/api/client.js && node --test test/api-retry-hardening.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: stalled provider streams no longer hang a turn (idle watchdog); retry backoff jittered; rate limits surface after 2 attempts.
- `docs/deep-dive.md` § 5 and § 22.3: mark applied.
- `docs/code-quality-and-security.md`: retry policy row if one exists.
