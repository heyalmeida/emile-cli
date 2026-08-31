# Spec: Web search and tool execution reliability

| Field | Value |
|-------|-------|
| **ID** | `2026-08-31-web-search-tool-reliability` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 3 — Agent capability and execution reliability |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

The agent has no real-time web-search capability, which limits research-heavy
and design tasks. OpenRouter now exposes web search as a model-callable server
tool, while other configured providers do not share a compatible contract.

The reported tool workflow also has reliability gaps: every `runCommand` call
starts a fresh shell, so a successful `cd` is lost; stream failures are shown
only as the unhelpful `Provider returned error`; and file handlers need clearer
boundary validation so malformed `writeFile`/`editFile` calls fail predictably.

## 2. Goal

Expose OpenRouter's `openrouter:web_search` server tool behind an explicit,
cost-visible CLI opt-in, preserve a validated working directory within the
active Emile session, and make provider/tool failures actionable without
leaking credentials or weakening workspace/shell gates.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | When web search is enabled and the provider is OpenRouter, the agent MUST receive the `openrouter:web_search` server tool with bounded result parameters; other providers MUST NOT receive an unsupported tool schema. | Must |
| RF-S02 | Web search MUST be explicit and cost-visible: CLI configuration and `/websearch` MUST toggle it, and the UI/docs MUST state that provider search charges may apply even for free model routes. | Must |
| RF-S03 | A successful `cd` within `runCommand` MUST update the active session working directory for subsequent commands, while the directory MUST remain confined to the workspace. | Must |
| RF-S04 | Session records MUST preserve a validated working directory when available; new sessions MUST reset it to the workspace root, and legacy records without it MUST remain loadable. | Should |
| RF-S05 | Stream/provider errors MUST expose a bounded actionable classification including status/category when available, without rendering API keys, auth headers or raw response bodies. | Must |
| RF-S06 | `writeFile` and `editFile` MUST validate required string arguments at the handler boundary and return model-readable errors without partial writes or uncaught type errors. | Must |
| RF-S07 | Existing safe-mode, dry-run, `resolveSafePath`, undo and command-timeout controls MUST remain active; search/tool failures MUST return errors to the model rather than crash the REPL. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|----------|----------|
| **Risk classification** | High — adds provider-operated network search, changes shell working-directory state, and touches file-tool/API error boundaries. |
| **Assets/secrets** | API keys, workspace files, session history and provider search contents. Search configuration MUST never print credentials; web result text is untrusted model context. |
| **Command execution / file writes** | `runCommand` keeps safe-mode confirmation, whitelist and timeout; persisted cwd is validated with workspace confinement. `writeFile`/`editFile` continue through `resolveSafePath`, undo and dry-run. |
| **Untrusted inputs** | Model-selected search invocations, provider result text, shell output, cwd markers and file-tool arguments. Validate types, strip internal markers, bound output and reject paths outside the workspace. |
| **Negative criteria** | Never send the OpenRouter-only schema to other providers; never persist an outside-workspace cwd; never expose API keys/raw auth errors; never execute search result text as shell; never partially write on invalid file arguments. |

## 5. Out of Scope

- Implementing a new direct search API client or adding a search dependency.
- Providing native web search for Requesty, OpenCode or OpenCode Go without a documented provider contract.
- Automatically enabling paid web search for existing users; the feature is opt-in.
- Replacing the shell with a long-lived interactive process or changing the existing safe-mode policy.

## 6. Acceptance Criteria

- **AC-01:** Given OpenRouter and web search enabled, when a request is built, then it includes one bounded `openrouter:web_search` server tool; given another provider, then that schema is absent.
- **AC-02:** Given web search disabled, when the agent runs, then no search tool is sent; `/websearch` and `--web-search` enable it and communicate the possible extra charge.
- **AC-03:** Given `runCommand("mkdir -p site && cd site")` succeeds, when the next `runCommand("pwd")` runs, then it executes from the workspace-contained `site` directory.
- **AC-04:** Given a session is saved with a workspace-contained cwd, when it is loaded, then the cwd is restored; an outside or missing cwd falls back to the workspace root.
- **AC-05:** Given a stream/provider failure with status/code/message, when displayed, then the user sees a bounded actionable category/status and no credential or raw body.
- **AC-06:** Given missing/non-string file-tool arguments, when `writeFile` or `editFile` runs, then it returns a clear error and does not modify the filesystem or undo stack.
- **AC-07:** Given path traversal, unsafe shell commands, dry-run and command failure, when tools run, then existing gates and error-result behavior remain intact.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|-------------------|
| OpenRouter server-tool behavior is beta and may change. | Medium | Isolate the schema in provider-tool composition, keep it opt-in and document the dependency. |
| Search is not available through every provider. | Medium | Advertise availability only for OpenRouter and fail closed for other providers. |
| Shell commands can change directory and run a command in that directory in one call. | High | Capture only the resulting `$PWD`, validate it against the workspace, and never carry an outside path into later calls. |

## 8. References

- OpenRouter: `openrouter:web_search` server tool documentation.
- Related specs: `specs/2026-08-30-mcp-resilience-transports`, `specs/2026-08-30-streaming-input-integrity`.
