# BRIEF P1-7 — Honor AbortSignal across tool execution (runCommand, MCP, web)

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 15, § 21 (P1-7). Pairs with P0-3 (the lifecycle drain phase already calls `requestStop`, but for `runCommand` nothing listens).

## Goal

`executeToolWithSignal` (`src/agent/agent.js:90-109`) receives an AbortSignal and passes it ONLY to built-in handlers (`agent.js:101` — `handler(args, { signal, ...handlerContext })`). Two classes ignore it:

- MCP: `handleMcpToolCall(name, args)` is called WITHOUT the signal (`agent.js:95-98`, comment admits it: "handleMcpToolCall doesn't accept a signal yet").
- Enhanced-web handlers: `webToolHandlers[name](args)` (`agent.js:102-103`) — no signal.
- `runCommand` (inside `tools/handlers/`) receives `{ signal }` in its context but IGNORES it — the child process keeps running after cancel/shutdown. This silently defeats the drain phase: `drain-tools.js:44` calls `controller.requestStop('shutdown')` and the spawn keeps executing.

Make cancellation real end-to-end: cancel (Esc / shutdown drain) must stop the underlying work, not just the HTTP stream.

## Required design

1. **`runCommand`** (handler under `src/tools/handlers/`): honor `context.signal`:
   - On abort: kill the spawned child. POSIX: `child.kill('SIGTERM')`, then SIGKILL after a 500 ms grace if still alive. Windows: `child.kill()` first; if the process survives, `taskkill /pid <pid> /T /F` via a one-shot `spawnSync` (tree-kill so `npm run x` chains die too).
   - On abort, settle the handler promptly: return content `Error: command aborted by user.` (or a `requestStop`-reason-aware variant) instead of waiting out the 30 s timeout (`tools` command timeout). The cwd-probe marker must not be written for an aborted run (no phantom cwd switch).
   - Dry-run path unchanged (nothing to abort).
2. **MCP**: extend `handleMcpToolCall(name, args, { signal } = {})` (`src/mcp.js`) and forward `{ signal, timeout: <existing per-call timeout> }` to the SDK's `client.callTool(...)` options (the SDK accepts an AbortSignal per call). Timeout for the abort race stays the drain window. Keep `sanitizeMcpError` on the abort path (an `AbortError` must not leak URLs/tokens; format it as `Error: tool call aborted`).
3. **Web handlers**: `webToolHandlers[name]` (`src/web/index.js` — Tavily `searchWeb`, Firecrawl `browsePage`) accept a second `{ signal }` arg and pass it to their `fetch` calls. `agent.js:102-103` passes `{ signal }` to them like the built-ins get.
4. **Dispatch site** (`executeToolWithSignal`, `agent/agent.js:90-109`): MCP branch becomes `handleMcpToolCall(name, args, { signal })`; web branch passes `{ signal }`. Remove the now-obsolete "doesn't accept a signal yet" comment (`:96-97`).
5. **editFile / readFile / memory handlers**: these are fast local operations — minimum requirement: check `signal?.aborted` before starting and bail with the same aborted-error string. No mid-write aborts (an edit must remain atomic; partial edits are worse than slow ones).
6. The AbortController registered with `setActiveTool` (`agent/agent.js:172-173`) is the single cancel source — do not add a second control channel.

## Tests to add (`test/tool-abort-signals.test.js`)

- `runCommand`: spawn a long-running sleep and abort the controller → handler settles within ~200 ms and the child is dead (poll for exit; skip timing assertions on loaded CI with generous margins).
- Aborted `runCommand` returns the aborted-error content and does NOT switch session cwd.
- `handleMcpToolCall` forwards the signal (unit-test with a fake client that rejects on abort).
- Web handler: aborted signal rejects the in-flight fetch (mock `fetch`).
- editFile with pre-aborted signal returns the aborted error without touching the file.

## Constraints

- Security gates never regress: abort paths go through the SAME whitelist/dry-run decisions; aborting must not skip a gate mid-flight (gates run before the abort check matters).
- No new dependencies. `AbortSignal.timeout` usage already exists in the codebase (models catalog) — follow that style.
- Cancellation UX unchanged: the existing `⏹ Turn canceled.` path and drain-tools phases stay as-is; only the tools actually stop now.

## Verification

`node --check src/agent/agent.js src/mcp.js && node --test test/tool-abort-signals.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: tool cancellation now aborts runCommand child processes, MCP calls and web requests (signal plumbed end-to-end).
- `docs/architecture.md` § 2 tools row / § 3 invariant 3: one clause noting cancellation reaches the underlying process/request.
- `docs/deep-dive.md` § 15 / § 21 P1-7: mark applied.
