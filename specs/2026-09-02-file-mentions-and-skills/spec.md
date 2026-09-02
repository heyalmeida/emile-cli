# Spec: Workspace file mentions and skill discovery

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-file-mentions-and-skills` |
| **Status** | `approved` |
| **Phase/Context** | Agent context / Skills |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

Users cannot explicitly attach a workspace file to a turn. They must describe its path and rely on the model to decide to call `readFile`, which is slower and can be ambiguous. Users also cannot inspect the skills that Emile can load without browsing `.agent/skills/` outside the CLI.

This extends RF-12's conditional context selection while preserving Emile's workspace confinement and bounded prompt policy.

## 2. Goal

Allow a user to reference one or more workspace files with `@relative/path` in a prompt and give the model a bounded, clearly labeled snapshot of those files for that turn. Add `/skills` as a read-only command that lists every available workspace skill and its metadata.

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | A prompt token in the form `@relative/path` resolves only to an existing regular file inside the workspace; its normalized relative path and content are appended as labeled context for the current user turn. | Must |
| RF-S02 | `@` mention completion shows matching workspace-relative files while the prompt is being edited; selection inserts a usable mention token. | Must |
| RF-S03 | Repeated mentions resolve once, missing/directory/binary/unreadable files are not attached, and the user receives a bounded warning without interrupting the turn. | Must |
| RF-S04 | Attachments are bounded by a per-file cap and a total per-turn cap, preserving order and labeling truncation/omission. | Must |
| RF-S05 | Path traversal, absolute paths, external symlinks and special files are rejected before content reaches the model. | Must |
| RF-S06 | `/skills` lists all discovered `.agent/skills/*/SKILL.md` entries with name, description and keywords; it makes no filesystem changes and does not inject or activate a skill. | Must |
| RF-S07 | The new command appears in help, slash autocomplete and the README; the architecture, PRD, glossary, feature registry and changelog describe the delivered behavior. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **High** — selected file contents become LLM input, and a new interactive terminal completion surface renders filesystem-derived names. |
| **Assets/secrets** | Workspace file contents may contain secrets. Explicit attachment is user-directed; no file is attached implicitly. Attachments are transient and must not be emitted in terminal diagnostics or persisted outside normal user-message/session behavior. |
| **Command execution / file writes** | Not applicable. This feature performs read-only discovery/loading and never changes `runCommand`, tool handlers, safe mode or dry-run behavior. |
| **Untrusted inputs** | Prompt text and filesystem names/content are untrusted. Mention paths must be normalized and realpath-confined; terminal-visible names pass through existing control stripping and width clipping; the model receives content as data in labeled blocks. |
| **Negative criteria** | Reject `@/absolute`, `@../escape`, an in-workspace symlink to an external target, directories, FIFOs/devices and binary files. Do not auto-attach plain path text or files merely because they match a skill. |

## 5. Out of Scope

- Directories/globs, URLs, shell expansion and attachments outside the workspace.
- Creating, editing, enabling or disabling skills from `/skills`.
- Persisting attachment snapshots as a separate session artifact.
- Semantic retrieval or automatic attachment of files.

## 6. Acceptance Criteria

- **AC-01:** Given `@src/example.js` names an in-workspace text file, when the user submits the turn, then the model message includes one labeled bounded snapshot for that normalized path.
- **AC-02:** Given the prompt contains `@src/fi`, when the user requests completion, then matching workspace-relative files are offered and the chosen one is inserted as a mention.
- **AC-03:** Given duplicate, nonexistent, directory or binary mentions, when submitted, then valid attachments remain, each invalid item is omitted with a safe warning, and the turn continues.
- **AC-04:** Given a traversal, absolute path or external symlink mention, when submitted, then no external content reaches the model.
- **AC-05:** Given a file or combined attachments exceed their caps, when submitted, then the context remains bounded and labels truncation/omission deterministically.
- **AC-06:** Given `/skills`, when entered in the REPL, then every discovered skill is listed with safe name, description and keywords; no active-skill selection or file change occurs.
- **AC-07:** Focused positive/negative/boundary tests, syntax checks, lint, full tests and the documented CLI smoke test pass; UI behavior is manually checked at 60/80/120 columns and with Esc/Ctrl+C.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| User explicitly attaches a secret | High | The feature is explicit only, labels the attached paths, keeps content bounded, and documentation warns that attachments are sent to the active provider. |
| Filename contains terminal controls or wide characters | Medium | Strip controls, use existing width clipping, and test the completion/listing rendering. |
| Mention syntax conflicts with email addresses | Low | Recognize only tokens that resolve to a workspace-relative file; `user@example.com` is not a valid attachment path. |
| Completion scans a very large repository | Medium | Bound traversal, ignore configured/generated dependency directories, cap candidates and avoid reading file contents during completion. |

## 8. References

- [Project rules spec](../2026-08-25-rules-system/spec.md) — read-only prompt context, realpath confinement and control-sequence handling.
- [Skill relevance spec](../2026-08-30-skill-relevance/spec.md) — existing skill selection and caps.
