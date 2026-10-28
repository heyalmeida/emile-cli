# Spec: Input typed during a running turn is no longer silently truncated

| Field | Value |
|-------|-------|
| **ID** | `2026-10-10-turn-input-cap` |
| **Status** | `implemented` |
| **Phase/Context** | Terminal UI / active-turn input (`src/ui/turn-keys.js`) — deep-dive backlog item **P1-13** (§ 19 UI/UX, § 22.3 steering row) |
| **Related documents** | [Brief P1-13](../2026-10-08-deep-dive-backlog/briefs/p1-13-turn-input-cap.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 19 / § 21.1 / § 22.3](../../docs/deep-dive.md), [Visual identity](../../docs/visual-identity.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md), [feature: terminal-ui](../../features/terminal-ui.md) |

---

## 1. Problem / Motivation

While a turn is RUNNING, keystrokes and pastes go to `listenTurnKeys`, not to the
idle prompt. That draft is hard-capped at **400 characters** and everything past
the cap is discarded **without a word to the user**:

- the insert path only runs while `buffer.length < MAX_BUFFER_CHARS`, and the
  incoming chunk is sliced to the remaining room
  (`src/ui/turn-keys.js:287-292`) — once full, the whole keypress is ignored;
- the same hard gate guards `Enter` **inside a bracketed paste**
  (`:205-214`) and `Shift+Enter` (`:196-204`), so a multi-line paste stops
  landing newlines at the cap: an 8 KB paste keeps its first 400 characters and
  silently loses every line after them (F4);
- `sanitizeLine` re-applies the slice (`:30-36`) **and** collapses whitespace
  runs (`replace(/[^\S\n]+/g, ' ')`), which eats tabs and indentation — a second
  silent mutation, this time of the *content* rather than its length;
- the queue preview prints `queued: <first 90 chars>…` (`src/cli.js:368-371`),
  so even the visible feedback implies the whole text was taken (F6).

Reported on 2026-10-10 while dispatching a brief by paste into a running turn: the
user believed the full text was queued and only a 400-character fragment
arrived. The idle prompt has **no** cap — an 8 681-character paste reaches the
agent whole (F7, verified against `.emile/history/*.json`) — so the active-turn
path is the odd one out and the loss is invisible precisely where pasting a long
brief is the normal workflow.

F8: draining the queue mid-turn is a different concern (P2-13) and out of scope;
this spec is about the draft's integrity while it is being typed.

## 2. Goal

Text typed or pasted during a running turn reaches the queue intact: the limit is
generous and documented (16 000 characters), exceeding it drops the **oldest**
characters with **one** visible notice per turn, the draft size is shown in the
footer as it approaches the limit, the preview never implies completeness, and
the queued message is byte-identical to the draft apart from CRLF normalization
and control-character replacement.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | `turn-keys.js` exports `TURN_INPUT_MAX_CHARS = 16_000`, documented as a guard against unbounded memory rather than a UX limit (the idle prompt has none). | Must |
| RF-S02 | No input is ever dropped silently: when an insertion would exceed the cap, the draft is bounded by dropping the **oldest** characters, so the newest text always survives. | Must |
| RF-S03 | The drop is reported with exactly **one** dim notice per turn: `⚠ queued draft reached 16k chars — oldest text dropped`. A later overflow in the same turn does not print again. | Must |
| RF-S04 | The same drop-oldest rule applies to every growth path: ordinary text insertion, `Enter` inside a bracketed paste, and `Shift+Enter`. | Must |
| RF-S05 | Once the draft passes 80% of the cap, the live footer carries a draft counter (`queued draft: 12.8k/16k`), reusing the existing footer-segment mechanism. | Must |
| RF-S06 | `sanitizeLine` no longer collapses whitespace runs and no longer trims: it normalizes CRLF and replaces control characters **only**, keeping tabs and internal spacing byte-identical. Its final `.slice(TURN_INPUT_MAX_CHARS)` guard stays. | Must |
| RF-S07 | Control-character stripping is unchanged and still covers `[\u0000-\u0009\u000b-\u001f\u007f\u0080-\u009f]` (everything except `\n`), which includes `\t` → space at submit time only as part of that existing rule. | Must |
| RF-S08 | The queue preview shows an explicit `… (+N chars)` marker when the line exceeds the preview width, so it never implies the whole text was taken. | Must |
| RF-S09 | A draft that is whitespace-only is not queued (guarded at the submit site, not by mutating content). | Must |
| RF-S10 | The idle prompt's behaviour is unchanged: no cap, no counter, and an 8.7 KB paste still reaches the agent whole. | Must |
| RF-S11 | The public surface stays additive: `listenTurnKeys` keeps its signature, and the new helpers are exported for testing. No change to `persistentPromptInput`, to the P0-4 burst coalescing or to the P0-1 renderer. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low-Medium** per [Code Quality and Security § 1](../../docs/code-quality-and-security.md): pure `src/ui/` input handling (Low), raised by the **data-loss** dimension — before this change the component silently discarded user input, and after it user text crosses a boundary (draft → `pendingQueue` → next turn's prompt). No command execution, no paths, no credentials. |
| **Assets/secrets** | The user's typed text. The change removes a truncation that could silently drop part of a pasted instruction; nothing new is logged or persisted, and the notice contains only a size, never content. |
| **Command execution / file writes** | Not applicable — the module never spawns or writes files. The queued text reaches the agent through the existing `pendingQueue` path. |
| **Untrusted inputs** | The draft is user input, and control characters are the injection surface for terminal escapes: they continue to be replaced by spaces (unchanged), which is why tabs are the only "whitespace" that may survive inside the draft and are still normalized at submit. |
| **Negative criteria** | Must NOT: drop the **newest** input; drop anything silently; weaken control-character stripping; mutate tabs/internal spacing; cap or alter the idle prompt; touch the burst coalescing (P0-4), the thinking renderer (P0-1) or `persistentPromptInput`'s state machine; add a dependency; print draft content in the notice. |

## 5. Out of Scope

Reported, not fixed (Rule 6.2):

- **Mid-turn steering** (draining the queue at a safe point inside the turn) — backlog **P2-13**; today the queue drains between turns (`src/cli.js:354-465`).
- **`turn-keys.js`'s uncapped cursor-up** (`:78`, `:91`) — backlog **P2-19**.
- **The prompt block's missing height budget** — backlog **P2-18**.
- **The `[Pasted: N lines]` collapse chip** — not briefed yet.
- **The thinking renderer / shared clamp** — P0-1, already landed.

## 6. Acceptance Criteria

- **AC-01:** Given a running turn, when 20 000 characters are pasted, then the queued line's length is exactly `TURN_INPUT_MAX_CHARS`, its tail is the **newest** text, and the truncation notice is printed **exactly once**.
- **AC-02:** Given a second paste after that, then the draft appends and trims the head: the queued tail contains the newest bytes and the oldest paste prefix is gone.
- **AC-03:** Tabs and internal double spaces survive into the queued line (the corruption regression).
- **AC-04:** Control characters (e.g. `\u0007`) are still replaced in the queued line.
- **AC-05:** The live footer shows the draft counter (`queued draft: …k/16k`) once the draft passes 80% of the cap, and does **not** show it below that.
- **AC-06:** The preview line carries the `(+N chars)` marker for a draft longer than the preview width, and no marker for a short one.
- **AC-07:** Pasted newlines keep landing past the old 400-character cap (the F4 case), with the draft bounded by the new rule only.
- **AC-08:** An idle-prompt paste of 8.7 KB still reaches the agent whole (direct `persistentPromptInput` assertion), and the neighbouring suites (`prompt-input-render`, `thinking-stream-append`) stay green.
- **AC-09:** `node --check` clean on both touched files; the full suite exits 0; `npm run lint` reports 0 errors.
- **AC-10:** Rule 2 docs sync: CHANGELOG `[Unreleased] → Fixed`; `docs/deep-dive.md` § 19 and § 21.1 P1-13 marked applied; `features/terminal-ui.md` Change History row.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Raising the cap 40× increases what one queued line can carry into the next request. | A very long queued text consumes context on the next turn. | Deliberate: 16 000 characters is roughly a page, the idle prompt already allows unbounded input, and the alternative is silent data loss. The counter makes the size visible before submitting, and the draft is bounded so memory cannot grow without limit. |
| Dropping the oldest characters can cut a pasted brief mid-sentence. | The queued text starts mid-word. | Still strictly better than the previous behaviour (which kept the head and silently dropped everything after) and now **visible**: one notice plus a footer counter. The policy is "keep what the user just pasted", which is what matters when re-pasting. |
| Removing `.trim()` from `sanitizeLine` could queue a whitespace-only draft. | An empty-looking message enters the queue. | Guarded at the submit site (`line.trim().length > 0`), so the guard no longer mutates the content — it only decides whether to queue. |
| The notice is written while the stdout lease is active. | It could land inside the frame. | It goes through `process.stdout.write`, which the lease already routes above the prompt — the same mechanism the existing `queued:` preview uses. |
| A user might paste more than 16k *deliberately*. | The oldest part is dropped. | The notice states exactly what happened, and it prints once rather than per keypress, so it cannot flood the transcript. |

## 8. References

- `src/ui/turn-keys.js` — `TURN_INPUT_MAX_CHARS`, `sanitizeLine`, the insert/Enter/Shift+Enter paths, `createLiveInput.drawFrame` (footer segments), `listenTurnKeys`.
- `src/cli.js:361-373` — `onLine` handler and the queue preview; `pendingQueue` drain at `:449`.
- `src/ui/prompt-input-persistent.js:281-287` — `buildPromptFooterSegments`, the segment mechanism reused for the counter.
- `src/ui/prompt-input.js` — `isShiftEnterKey`.
- `test/turn-keys-visibility.test.js` — the harness pattern (fake stdin, captured stdout, terminal emulator).
- `test/prompt-input-render.test.js` — idle-prompt inspection pattern used for the no-regression check.