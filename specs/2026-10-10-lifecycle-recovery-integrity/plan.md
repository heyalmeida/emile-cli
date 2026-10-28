# Plan: Recovery, abort and shutdown integrity

> Filled from the approved `spec.md`. The design is fixed by brief P0-3 and is
> not re-derived here; this document records how it lands.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-lifecycle-recovery-integrity` |
| **Status** | `implemented` |

> **Implementation notes (recorded after the fact).**
> 1. `src/lifecycle/index.js` grew past its 150-line lint gate while adding the
>    force-exit seam, so the additions were compacted (arrow-function exit code,
>    one-line guard) — behaviour unchanged.
> 2. Two sites beyond the brief's Step 6 also cleared the screen on exit:
>    `cli.js`'s normal exit path called `console.clear()`. It was removed too —
>    the mission says "exit must not wipe the screen", and fixing only the phase
>    would have left the defect in the common path. `console.clear()` in
>    `/switch` (mid-session redraw) was left alone and is reported.
> 3. `test/recovery.test.js`'s fixtures used the dead `'pending'` status (the bug
>    itself); they were corrected to `'tool_pending'` with every original
>    assertion preserved, and a comment added explaining why.

---

## 1. Technical Approach

Eight changes across `recovery.js`, `history.js`, `cli.js`, the lifecycle phases
and the persistent prompt. No new module, no new dependency.

### 1.1 Recovery vocabulary (`recovery.js`, `history.js`)

- `recovery.js` selects `record.status === 'tool_pending'` — the only status a
  writer produces for a mid-tool checkpoint. The header comment is corrected
  (it documented `'pending'`, which is dead vocabulary).
- `history.js`: `listPending` → **`listToolPending`**, filtering `tool_pending`.
  It has no callers, so the rename is free and removes the last place where the
  phantom status could be re-introduced.
- **Quarantine**: both corrupt branches of the scan (the `classify` verdict and
  the JSON-parse failure) call `moveToCorrupt(sessionId, { directory: scanDir })`.
  The directory parameter matters because `moveToCorrupt` resolved the module
  level `historyDir`, while the scan can be pointed at another directory (that is
  how the tests drive it). The move is best-effort and inside the scanned
  directory; nothing else about the scan changes — it still never executes a tool
  and never rewrites a record. The report gains `quarantined: string[]`.

### 1.2 Honest boot report (`cli.js`)

The `recoveryReport.abandoned` read is deleted. The report becomes:

- `recoverable > 0` → always printed (not only in `--verbose`), actionable:
  `1 recoverable session — resume it with /switch or the resume prompt`.
- `corrupt > 0` → always printed, naming the quarantine directory.
- `--verbose` additionally prints the scanned count and scan errors.
- a zero-item report prints nothing.

### 1.3 Abort without losing resumability (`history.js`, `cli.js`, `drain-tools.js`)

```js
export function markAborted(sessionId, reason) {
  // read → never touch `status` or `pendingToolCalls` →
  // data.aborted = true; data.abortReason = <string>; data.updatedAt = now
  // → atomic write
}
```

Deliberately additive: a `tool_pending` record stays `tool_pending` (so
`resumePendingTools` still replays it) and now also says *why* the turn stopped.

Wiring:

- the coordinator's option becomes `markAborted(reason)` — the **live** session
  id is the caller's business, not the phase's;
- `drain-tools` calls it when it had to force-abort a tool that outlived the
  drain window (that is precisely "a turn interrupted mid-tool");
- `cli.js` supplies the closure and the guards:
  `markAborted: (reason) => { if (!turnInFlight) return; markAborted(sessionId, reason || 'shutdown'); }`
  with `turnInFlight` set around `runAgentTurn`. A signal at an idle prompt
  therefore records nothing, which is correct — there is no aborted turn.
- `resumeLoadedSession` prints one line when `record.aborted` is set and proceeds
  exactly as before.

### 1.4 Real prompt teardown (`prompt-input-persistent.js`, `lifecycle/index.js`, `cli.js`)

- The `onReady` handle gains `shutdown` — the **existing** internal `shutdown`
  function (the same one its own Ctrl+C path calls), not a copy: it removes the
  keypress listener, restores `wasRaw`, emits `?2004l`, and resolves the prompt.
- `installShutdownHandlers` takes an optional `shutdownPrompt` and registers it
  (falling back to a no-op), instead of hard-coding the no-op.
- `cli.js` keeps `livePromptApi` in the scope that encloses the coordinator call
  and passes `shutdownPrompt: () => livePromptApi?.shutdown?.()` — a safe no-op
  before the prompt exists (optional chaining).
- Because that teardown resolves the REPL's `await`, the code after it checks
  `isShuttingDown()` and returns immediately: no "Goodbye", no screen clear, no
  second `shutdownMcp()` racing phase 5. The coordinator owns the exit.

### 1.5 Terminal restore (`restore-terminal.js`, `cli.js`)

- Keep `\x1B[?2004l`, `\x1B[?25h`, `\x1B[0m`; **delete `\x1B[2J` and `\x1B[H`**;
  end with a single `\n`.
- The phase's doc comment is corrected: raw mode is restored by the prompt
  teardown in phase 1, not "already handled elsewhere".
- `cli.js`: the normal exit path drops `clear()` (`node:console.clear()` emits a
  screen clear) — same defect, same exit path as the phase (RF-S12).

### 1.6 Force exit on the second signal (`lifecycle/index.js`)

```js
const exitCodeFor = (reason) => reason === 'SIGINT' ? 130 : reason === 'SIGTERM' ? 143 : 1;

function guard(reason) {
  if (_ReEntrant) {           // second signal: no phases, just leave
    forceExit(reason);
    return true;
  }
  _ReEntrant = true;          // set synchronously, before any await
  return false;
}
```

`forceExit` is a tiny injectable seam (`process.exit` by default) so the behaviour
is testable without killing the test process. The header comment, which promised
this behaviour all along, becomes true.

### 1.7 Atomic session writes (`history.js`)

One helper, used by both writers, following `memory/io.js:20-42`:

```js
function writeFileAtomically(filePath, contents) {
  const tempPath = `${filePath}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fd, contents, 'utf8');
    fs.fsyncSync(fd);      // durable BEFORE the rename replaces the good file
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
  }
}
```

`saveSession` and `markAborted` both go through it. On any throw the previous
file is untouched and the temp is cleaned up (AC-08).

`flushSync()` becomes real: it fsyncs the live session file (recorded by the
last `saveSession`) and the history directory, best-effort, never throwing — the
phase keeps a genuine meaning.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (pure ESM, no dependency) — respected.
  ADR-0002 (quality gates) — four new suites plus the existing ones.
  No new ADR: no boundary or stack change; the coordinator keeps owning the exit.
- **Architecture document:** three rows change and one of them is a **documented
  reversal** — `recovery.js` was described (by P2-11) as "read-only, never moves
  sessions"; it now quarantines corrupt files, which the brief requires
  explicitly. `history.js` gains atomic writes; `lifecycle/` gains the real
  prompt teardown and the force-exit.
- **Design system:** `restore-terminal` emits fewer sequences, none of them
  visible; the boot report uses the existing `C.muted/C.success/C.warn` tokens.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Unchanged. The scan **never executes a tool**; it only parses, validates paths and (now) moves one file. |
| File writes and `resolveSafePath` | Session writes stay inside `.emile/history/`; the temp file lives beside its target so the rename is same-directory (atomic on POSIX and Windows). Quarantine targets are built from the scanned directory, not from record content. |
| LLM inputs (prompt injection / tool args) | Session JSON is untrusted: parse failures are quarantined rather than trusted, and `classify` still re-validates every tool-call argument path through `resolveSafePath`. |
| Secrets (API keys, sessions, exports) | No new output; the boot report prints counts and a directory name, never message content. |
| Controls and negative criteria | AC-01/02/03 pin the scan's honesty; AC-04 the additive abort; AC-05 the lease release; AC-06 the transcript; AC-07 the force exit; AC-08 the durability. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Recovery | `src/recovery.js` | `tool_pending` selection, quarantine call, `quarantined` in the report, corrected header. |
| History | `src/history.js` | `listToolPending`; additive `markAborted`; `moveToCorrupt(directory)`; atomic write helper; real `flushSync`. |
| Lifecycle | `src/lifecycle/index.js` | `shutdownPrompt` option; force-exit on re-entry; header tells the truth. |
| Lifecycle | `src/lifecycle/drain-tools.js` | calls `markAborted(reason)` when it aborts a tool. |
| Lifecycle | `src/lifecycle/restore-terminal.js` | no screen clear, trailing newline, corrected comment. |
| UI | `src/ui/prompt-input-persistent.js` | `onReady` handle exposes `shutdown`. |
| CLI | `src/cli.js` | boot report, abort closure, prompt-teardown wiring, exit-path screen clear removed, resume notice. |
| Tests | `test/lifecycle-recovery.test.js`, `test/lifecycle-stdin.test.js`, `test/session-atomicity.test.js`, `test/session-abort.test.js` | new. |
| Tests | `test/recovery.test.js` | fixtures corrected to the real `tool_pending` vocabulary; every original assertion kept. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none |
| Slash command | `/switch`, resume prompt | behaviour: an aborted-but-resumable session reports the interruption and replays |
| Tool | — | none (the scan still executes nothing) |
| Env var | — | none |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------|
| Create | `specs/2026-10-10-lifecycle-recovery-integrity/{spec,plan,tasks}.md` | this pack |
| Create | `test/lifecycle-recovery.test.js` | scan vocabulary, quarantine, report |
| Create | `test/lifecycle-stdin.test.js` | coordinator teardown + force exit; prompt handle |
| Create | `test/session-atomicity.test.js` | temp+fsync+rename, old file survives |
| Create | `test/session-abort.test.js` | additive abort + resume |
| Modify | `src/recovery.js`, `src/history.js`, `src/cli.js` | see § 4 |
| Modify | `src/lifecycle/{index,drain-tools,restore-terminal}.js` | see § 4 |
| Modify | `src/ui/prompt-input-persistent.js` | `onReady.shutdown` |
| Modify | `test/recovery.test.js` | fixture vocabulary |
| Modify | `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md`, `features/session-lifecycle.md`, `specs/2026-10-08-deep-dive-backlog/README.md` | Rule 2 / Rule 7.4 |

## 7. Technical Decisions (summary)

1. **`listPending` is renamed, not kept as an alias** — it had no callers and the
   rename deletes the phantom-status trap instead of documenting it.
2. **`moveToCorrupt` gains a `directory` option** rather than reading the module
   level constant, because the scan is directory-parameterized and tests rely on
   that; the default preserves the original behaviour.
3. **`markAborted` is purely additive** — the whole point is that an abort must
   not cost the user their resume.
4. **The coordinator's `markAborted` takes the reason, not an id**: the live
   session identity belongs to the caller that owns it, and the brief asks for a
   closure that no-ops when no turn is in flight.
5. **`forceExit` is an injectable seam with `process.exit` as the default** — the
   only way to assert "the second signal exits" without killing the test runner.
6. **`.tmp` suffix (not a randomized hidden name)**: the brief specifies
   `<file>.tmp`, the directory is emile-owned, and session writes are serialized
   by the single-threaded REPL; the cleanup path makes a stale temp impossible.
7. **`flushSync` fsyncs file *and* directory** — a rename is only durable once
   the directory entry is synced; on Windows a directory fsync may be
   unsupported, so it is best-effort and never throws.
8. **Both screen-clear sites are removed** (the phase and the normal exit path):
   the mission says "exit must not wipe the screen", and fixing only one would
   leave the user-visible defect in the common path.

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01/02/03 | `test/lifecycle-recovery.test.js` with a temp `.emile/history/`: `tool_pending` → recoverable; malformed → corrupt **and** the moved file exists under `corrupt/<id>/` while a sibling `complete.json` is untouched; zero-item/missing dir returns a zero report and does not throw; the report has no `abandoned` key. |
| AC-04 | `test/session-abort.test.js`: `markAborted` keeps `status: 'tool_pending'`, sets `aborted`/`abortReason`, preserves `pendingToolCalls`, survives a re-read, and `resumePendingTools` still replays only the missing results. |
| AC-05 | `test/lifecycle-stdin.test.js`: the coordinator is installed with injected fakes; the first SIGINT runs `shutdownPrompt` exactly once (a fake that restores raw mode on a stubbed stdin) and reaches `process.exit(130)` (spied). |
| AC-06 | `test/lifecycle-stdin.test.js` captures the phase output: no `\x1B[2J`/`\x1B[H`; plus a source-level assertion that neither the phase nor `cli.js`'s exit path contains a screen clear. |
| AC-07 | Same file: a second SIGINT while shutting down calls the exit seam again with the same code **without** re-running any phase (`shutdownPrompt` call count stays 1). |
| AC-08 | `test/session-atomicity.test.js`: with `fsyncSync` (and separately `renameSync`) replaced by a thrower, the previous file's bytes are unchanged and no `.tmp` remains; a successful save leaves no `.tmp` and parses. |
| AC-09 | `node --check` on every touched file, the four new suites, `npm run lint`, `npm test` (exit 0). |
| AC-10 | Docs diff review, including the `architecture.md` reversal; Rule 5 table validation. |

Commands (Rule 6.3): `node --check src/recovery.js src/history.js src/cli.js
src/lifecycle/*.js src/ui/prompt-input-persistent.js`;
`node --test test/lifecycle-recovery.test.js test/lifecycle-stdin.test.js
test/session-atomicity.test.js test/session-abort.test.js`;
`npm run lint`; `npm test`. Smoke: a real SIGINT/SIGTERM needs an interactive
terminal and a live turn; the injected-fake coordinator test plus the signal
emission cover the wiring, and the interactive check is recorded as a
non-executed verification.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` (confirmed via `git branch --show-current`); no switch/branch/worktree (Rule 8). |
| **Commit plan** | Two coherent units — (1) spec + recovery/abort/atomic writes + their tests, (2) stdin lease + terminal restore + force exit + their tests — then (3) the docs sync. Explicit paths only; the untracked `prompt-paste-text.txt` is the user's capture and is left alone. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | The boot report names counts and the quarantine directory; every new write path is best-effort with a `try/finally` cleanup. |
| Interruption (Ctrl+C / Esc) and stdin state | Phase 1 now really tears the prompt down (listener + raw mode + paste mode); the second signal bypasses phases entirely. |
| Partial state (session, undo stack, file cache) | The atomic helper makes a partial session file impossible; `markAborted` is additive so a tool-pending checkpoint survives; the quarantine move is a rename inside the same tree. |
| Rollback / undo | Revert the commits. No format migration; quarantined files are preserved on disk, so a revert loses nothing permanently. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| The prompt teardown resolving the REPL promise changes shutdown ordering. | Certain | The REPL returns immediately when `isShuttingDown()`, so no second shutdown path runs; asserted by the exit-path check in AC-06 and by reading the code path in the review. |
| Quarantine on first boot moves files a user expected to see in `.emile/history/`. | Low, once | Moved, never deleted; the report names it; the final report states the exact effect explicitly. |
| fsync on Windows can throw for some paths. | Medium | `flushSync` is best-effort per target and never throws; the atomic helper only fsyncs a regular file it just wrote. |
| Removing `clear()` changes the normal exit experience. | Certain, intended | It is the defect: the transcript must survive. A single blank line separates the last output from the shell prompt. |
| The module-level `_ReEntrant` latch makes repeat installs in one process force-exit. | Low (tests) | Documented; the coordinator test drives one install and asserts the sequence explicitly. |