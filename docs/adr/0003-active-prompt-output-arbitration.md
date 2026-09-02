# ADR-0003: Active prompt output arbitration

## Status

**Decided** (2026-09-02)

## Context

The REPL must keep the standard prompt usable while an agent turn is running.
A compact prompt drawn with ANSI save/restore cursor sequences kept the agent's
cursor safe, but left the real blinking cursor on the thinking spinner. Expanding
that overlay to the full prompt also made spinner, reasoning and response writes
compete with the draft rows, progressively erasing or duplicating the frame.

The CLI uses several focused raw-ANSI renderers rather than a centralized TUI
framework. Replacing every renderer is outside this regression's scope, but the
active prompt still needs exclusive ownership of both stdin and its screen rows.

## Decision

- `listenTurnKeys` takes a temporary lease on `process.stdout.write` only for
  the lifetime of an interactive agent turn.
- Before forwarding a normal output write, it removes the active prompt and
  restores the saved agent-output cursor. After the write, it reserves bounded
  rows, saves the new output cursor, redraws the shared full-prompt layout and
  leaves the real terminal cursor at the draft caret.
- Prompt-internal writes bypass the lease to prevent recursion. Cleanup always
  removes the frame and restores the exact writer that preceded the lease.
- Stdin remains single-owner: the idle prompt, active-turn prompt and nested
  pickers never attach keypress listeners concurrently.
- High-frequency spinner frames are emitted atomically so one animation tick
  triggers one prompt-preserving redraw.
- Non-interactive output keeps the existing path and does not install the lease.

## Consequences

**Positive:** the idle and active states use the same bounded layout, streamed
output stays above the draft, and the visible cursor reflects where typing
actually occurs. Existing UI renderers do not need prompt-specific callbacks.

**Accepted negatives:** active turns redraw the prompt after each stdout write,
so renderers should prefer atomic writes. The lease mutates a process-wide stream
method temporarily; strict cleanup, exclusive ownership and ANSI-emulator tests
are required to prevent leakage into later REPL or non-interactive output.

## Alternatives considered

- **Compact save/restore overlay:** rejected because the real cursor remained on
  the spinner and full-frame redraws collided with streaming output.
- **Pass hide/redraw callbacks through every renderer:** explicit but invasive;
  it would couple the agent loop, tools, thinking, response and spinner modules
  to one input implementation.
- **Adopt Ink/Blessed or a full-screen TUI:** rejected by ADR-0001's dependency,
  startup and raw-ANSI constraints and disproportionate to this lifecycle fix.
