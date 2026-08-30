# ADR-0001: Tech stack choice

## Status

**Decided** (ratification of the existing stack as official policy)

## Context

emile-cli is a terminal coding agent, a personal project being formalized as a serious project (Phase 0 of the [roadmap](../roadmap.md)). The current stack was chosen organically during development; this ADR ratifies it as a conscious decision and defines what would require a new decision.

Constraints and considerations:

- **One-person project** — iteration speed and absence of heavy tooling matter
- **The CLI must start fast** — time to ready prompt is a UX requirement
- **Provider-agnostic by design** — no coupling to a single LLM vendor
- **No CI and no test suite yet** — the stack must allow adding gates later without a rewrite

## Decision

| Layer | Choice | Rationale |
|--------|---------|---------------|
| Runtime | **Node.js >= 18** | Native `fetch`, native ES modules, ubiquity |
| Language | **Plain JavaScript (ES modules), no build step** | `node bin/emile.js` runs the code directly; zero tooling to contribute; TypeScript would require a new ADR |
| CLI framework | **commander** | Market standard for flag parsing; stable |
| Interactive prompts | **@clack/prompts** | Clean API for wizards/confirmations; used with fail-closed defaults |
| LLM client | **`openai` SDK** | Any OpenAI-compatible endpoint works by swapping `baseURL` (Requesty, OpenRouter, OpenCode) |
| Terminal UI | **Raw ANSI via picocolors + true-color** (`src/ui.js`) | No Ink/React/Blessed: total control, zero heavy render dependencies; centralized Tokyo Night palette |
| Tool protocol | **@modelcontextprotocol/sdk** (STDIO) | Emerging standard for external tools |
| Skills | **YAML frontmatter + markdown** (js-yaml) | Skills are readable and versionable without a build |
| Validation | **zod** | Config and boundary-input validation |

## Consequences

**Positive:**
- Trivial contribution: clone + `npm install` + `node bin/emile.js`
- Startup optimized by dynamic imports (the pattern in `cli.js`)
- Swapping/adding an LLM provider doesn't touch the agent loop

**Accepted negatives:**
- No static types — mitigated by review gates (`docs/code-quality-and-security.md`) and, later, tests (Phase 2)
- Raw-ANSI UI requires design-system discipline — mitigated by `docs/visual-identity.md`
- zod and js-yaml are runtime dependencies, not devDependencies — reviewed via `npm audit` on every change

## Alternatives considered

- **TypeScript + tsup/esbuild**: types and DX, but introduces a build step, conflicts with the "no build" principle and adds friction to contributions. Would require a new ADR.
- **Ink (React for CLIs)**: declarative components, but a heavy dependency for startup and excessive abstraction for custom boxes/spinners.
- **Blessed/neo-blessed**: full TUI, but abandoned/unstable and beyond what's needed.

## Derived policies

1. Any new runtime dependency requires justification + `npm audit` (code-quality-and-security § 3).
2. Introducing a build step, TypeScript or a terminal UI framework requires a **new ADR**.
3. Provider logic stays confined to `api.js`/`config.js`; the agent loop remains provider-agnostic.
4. All documentation is written in **English** — the project is open source.
