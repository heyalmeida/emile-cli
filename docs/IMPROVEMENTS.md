# Proposed Improvements — emile-cli

> A codebase analysis with improvement suggestions, ordered by impact.
> References point to the exact files and functions where each item applies.

---

## 1. Correctness and Robustness

### 1.1 `editFile` can silently corrupt files

**File:** `src/tools.js` → `editFile` handler

When `targetContent` appears **more than once** in the file, the function
replaces only the first occurrence without warning. If the LLM sends a generic
snippet (e.g., `}` or a repeated line), the edit lands in the wrong place.

**Suggestion:** count occurrences before replacing. If there is more than one,
return an error to the model asking for more context in `targetContent`:

```js
const occurrences = oldContent.split(targetContent).length - 1;
if (occurrences > 1) {
  return `Error: targetContent found ${occurrences} times in "${filePath}". Provide more surrounding context to make the match unique.`;
}
```

Apply the same check to matching levels 2 and 3 (line-ending normalization and
line-by-line comparison).

---

### 1.2 Stream errors are swallowed

> **✅ RESOLVED** — `specs/2026-08-25-model-system`: the catch now prints `✗ Stream error: <message>`; partial reasoning/text still renders.

**File:** `src/agent.js` → main `runAgent` loop

The block:

```js
} catch (streamErr) {
  if (isFirstChunk) spinner.stop('Stream error', '✗');
}
```

doesn't print the error or the accumulated partial text. Mid-response failures
appear to the user as an "empty reply" with no explanation.

**Suggestion:**

- Always log `streamErr.message`.
- If there is already partial content in `textContent` or `reasoningContent`,
  display it marked as incomplete, so paid tokens aren't lost.

---

### 1.3 Retry ignores the `Retry-After` header

> **✅ RESOLVED** — `specs/2026-08-25-model-system`: `getRetryDelayMs` honors `Retry-After` (seconds or HTTP-date), falling back to linear backoff.

**File:** `src/api.js` → `createChatCompletion`

On HTTP 429, servers frequently send `Retry-After` (seconds or a date). The
fixed backoff (`attempt * 1.5s`) ignores it and tends to fail again, wasting
the attempts.

**Suggestion:**

```js
function getRetryDelayMs(err, attempt) {
  const retryAfter = err?.headers?.['retry-after'];
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return secs * 1000;
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  return attempt * 1500; // current fallback
}
```

---

### 1.4 API key fallback mixes up providers

> **✅ RESOLVED** — `specs/2026-09-02-session-lifecycle`: `config.resolveApiKey(provider)` returns the key for the active provider only; cross-provider env var fallback is removed; the connect wizard surfaces the missing key explicitly.

**File:** `src/config.js`

The current chain:

```js
apiKey: savedConfig.apiKey || process.env.REQUESTY_API_KEY
  || process.env.OPENROUTER_API_KEY || process.env.OPENCODE_API_KEY || ''
```

uses whichever key is available, regardless of the active provider. If
`provider = 'requesty'` but only `OPENROUTER_API_KEY` exists, it is silently
used as the Requesty key — resulting in a hard-to-diagnose 401.

**Suggestion:** resolve the env var by provider:

| Provider | Env var |
|----------|---------|
| `requesty` | `REQUESTY_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `opencode` | `OPENCODE_API_KEY` |
| `opencode-go` | `OPENCODE_API_KEY` |

If none matches, start empty and let the connection wizard handle it.

---

### 1.5 `undoStack` grows without limit

> **✅ RESOLVED** — `specs/2026-09-02-session-lifecycle`: the stack is now bounded at 50 entries; overflow discards the oldest from memory and its disk file; `/undo` persists across restarts via `.emile/undo/<sessionId>/`.

**File:** `src/tools.js` → `src/tools/file-state/`

Every `writeFile`/`editFile` pushes the previous state onto an in-memory stack
with no limit. In long sessions with many large files, memory consumption
grows unchecked.

**Suggestion:** cap the stack (e.g., 50 entries), discarding the oldest:

```js
const MAX_UNDO_ENTRIES = 50;
undoStack.push({ path: targetPath, content: oldContent });
if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();
```

---

## 2. Security

### 2.1 API key stored in plain text

> **✅ RESOLVED** — `specs/2026-09-02-session-lifecycle`: `saveUserConfig` writes `.emile/config.json` with `mode: 0600`; an existing file is `chmod`'d on the next save; if the filesystem rejects the permission (e.g. FAT), a `--verbose` warning is logged and the write continues.

**File:** `src/config.js` → `saveUserConfig`

The key sits in `.emile/config.json`, readable by any process/user on the
machine, and an accidental commit would leak credentials.

**Minimum actions:**

1. Create the file with `0600` permissions:
   ```js
   fs.writeFileSync(userConfigPath, data, { mode: 0o600 });
   ```
2. Ensure `.emile/` is in `.gitignore`.
3. Warn the user in the connection wizard about the env-var alternative.

**Ideal:** support only env vars / OS keychain for the key.

---

### 2.2 Expand the safe-command whitelist

**File:** `src/tools.js` → `SAFE_COMMANDS_WHITELIST`

Clearly read-only commands today trigger unnecessary confirmation. Add:

```
git branch, git status <path>, node --version, npm --version,
cat, head, tail, wc, which, echo
```

Keep the `safeMode` gate unchanged for everything else.

---

## 3. Engineering Quality

### 3.1 Zero automated tests

There is no `test` script, no CI and no linter in `package.json`. The code is
well modularized, so the entry cost is low.

**First unit test priorities:**

- `tools.js`
  - `resolveSafePath`: path traversal (`../`, absolute paths outside the workspace, symlinks).
  - `editFile`: the 3 matching levels + the ambiguous case (item 1.1).
  - Read cache and invalidation after writes.
  - Undo stack with a limit.
- `api.js`
  - `isRetryable` for each status/code.
  - Retry delay honoring `Retry-After` (item 1.3).
- `agent.js`
  - `calculateCost` and `getContextLimit` for known models + a safe default.
  - Extraction of embedded tool calls from text (`<TOOLCALL>` regex).

**Suggested infra:** `node:test` (native, zero new dependencies) + ESLint
(`npm run lint`). Both pluggable into GitHub Actions later.

---

### 3.2 Hardcoded price and context tables

> **✅ RESOLVED** — `specs/2026-08-25-model-system`: single `MODEL_INFO` table in `src/models.js` (context, prices, reasoning capability); `calculateCost`/`getContextLimit` delegate to `getModelInfo()`.

**File:** ~~`src/agent.js`~~ → `src/models.js`

Fixed values scattered across conditionals go stale quickly (the prices are
already outdated) and duplicate model knowledge.

**Suggestion:** extract to `src/models.js`:

```js
export const MODEL_INFO = [
  { match: /claude/,            context: 200_000, inputPrice: 3.0,   outputPrice: 15.0 },
  { match: /gemini-2\.5-pro/,   context: 2_000_000, inputPrice: 1.25, outputPrice: 5.0 },
  // ...
];
export function getModelInfo(model) { /* ... */ }
```

`calculateCost` and `getContextLimit` then consult this single table.

---

### 3.3 Missing `engines` field in `package.json`

> **✅ RESOLVED** — `specs/2026-09-02-session-lifecycle`: `package.json` now declares `"engines": { "node": ">=18" }`; `npm install` emits an `EBADENGINE` warning on older versions.

The README requires Node >= 18, but npm doesn't prevent installation on older versions.

---

### 3.4 `readFile` has no size cap for paid models

> **✅ RESOLVED** — `specs/2026-08-25-model-system`: universal cap of 2000 lines for every model, with an explicit truncation notice pointing to `startLine`/`endLine`.

**File:** `src/tools.js` → `readFile` handler

There is a 300-line cap only for free models; paid models receive the whole
file. A 50k-line file enters the context wholesale and can blow the window by
surprise.

**Suggestion:** a configurable cap (e.g., 2000 lines) for paid models too,
with explicit truncation notice and an instruction for the model to use
`startLine`/`endLine` to read the rest.

---

## Suggested Execution Order

| # | Item | Effort | Impact |
|---|------|---------|---------|
| 1 | 1.1 — ambiguous `editFile` | Low | High |
| 2 | 1.3 — `Retry-After` in retry | Low | Medium |
| 3 | 3.1 — Base tests + lint | Medium | High |
| 4 | 1.4 — API key per provider | Low | Medium |
| 5 | 1.2 — Visible stream errors | Low | Medium |
| 6 | 3.3 — `engines` field | Trivial | Low |
| 7 | 2.1 — `0600` permission on the key | Low | High (security) |
| 8 | 3.2 — Single model table | Medium | Medium |
| 9 | 1.5 — Undo stack limit | Low | Low |
| 10 | 3.4 — `readFile` cap for paid models | Low | Medium |
| 11 | 2.2 — Expanded whitelist | Low | Low |

> Each item should become its own small spec in `specs/` and be implemented on
> its own feature branch (e.g., `fix/editfile-ambiguous-match`,
> `feat/retry-after`, `chore/engines-field`) per the Git workflow in
> [`.clinerules`](../.clinerules) (Rule 8).
