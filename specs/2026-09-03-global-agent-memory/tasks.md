# Tasks: User-global agent memory

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-global-agent-memory` |

---

## Phase 0 — Preparation and design

- [x] T0.1 — Read the PRD, architecture, visual identity, security guide, glossary, roadmap, ADR-0001 and the related rules/session/MCP/compression specs — *Rule 1 of `.clinerules`*
- [x] T0.2 — Research official Claude/Claude Code memory behavior, current Opus/Fable model context and the three supplied papers; record conclusions and source links in the spec
- [x] T0.3 — Review the local `grok-build` memory crate for reusable architectural patterns without creating a dependency or copying its Rust implementation
- [x] T0.4 — Confirm the spec and plan are `approved`
- [x] T0.5 — Classify the feature as high risk and map persistent-data, path, concurrency, prompt-injection, privacy, deletion and recovery threats
- [x] T0.6 — Confirm the current branch is `development`, inspect `git status` and preserve unrelated user changes — *Rule 8 of `.clinerules`*
- [x] T0.7 — Record the native global-memory architecture and dedicated path boundary in ADR-0004

## Phase 1 — Confinement, schema and durable storage

- [x] T1.1 — Extend `resolveSafePath` with an internal explicit capability root so general tools remain workspace-confined and the non-exported memory resolver is confined to the global store *(unblocks AC-01, AC-08)*
- [x] T1.2 — Implement versioned schemas, record/state caps and legal transition validation *(verifies AC-02, AC-03, AC-05)*
- [x] T1.3 — Implement production/test memory-root resolution, containment, symlink/special-file rejection and permission enforcement *(verifies AC-01, AC-02, AC-08)*
- [x] T1.4 — Implement the token-owned writer lock with bounded retry, conservative stale recovery and ownership-checked release *(verifies AC-08)*
- [x] T1.5 — Implement snapshot + WAL transactions, checksums/revisions, atomic replacement, backup and generated `MEMORY.md` *(verifies AC-03, AC-08)*
- [x] T1.6 — Implement startup validation, replay, quarantine, read-only degradation and typed health results *(verifies AC-08, AC-12)*
- [x] T1.7 — Add fault-injection and concurrent-process tests for every interruption point and path/file-type boundary *(verifies AC-08, AC-12)*

> Commit this coherent storage/security unit on `development`, staging only its explicit files.

## Phase 2 — Privacy, formation and conflicts

- [x] T2.1 — Implement secret/high-risk identifier denial, sensitive-topic classification and content-free diagnostics using synthetic fixtures *(verifies AC-04, AC-09)*
- [x] T2.2 — Implement exact current-user evidence binding and reject assistant/reasoning/tool/file/web/MCP-derived proposals *(verifies AC-04)*
- [x] T2.3 — Implement normalized keys, deduplication and record-type/activation validation *(verifies AC-03, AC-05)*
- [x] T2.4 — Implement `ask` candidate state, two-distinct-session `auto` corroboration and explicit conflict state *(verifies AC-05)*
- [x] T2.5 — Implement explicit remember, accept and reject mutations with dry-run behavior *(verifies AC-03, AC-11)*
- [x] T2.6 — Add formation/privacy/property tests for invalid transitions, duplicate evidence, session spoofing, Unicode, caps and injection attempts *(verifies AC-03, AC-04, AC-05, AC-09)*

> Commit this coherent formation/privacy unit on `development`, staging only its explicit files.

## Phase 3 — Retrieval and context integration

- [x] T3.1 — Implement Portuguese/English query normalization, lexical/tag/type/recency/use scoring and deterministic tie-breaking *(verifies AC-07)*
- [x] T3.2 — Implement diversity selection and hard always/relevant/token budgets *(verifies AC-07)*
- [x] T3.3 — Implement the delimited untrusted memory projection with the required instruction precedence *(verifies AC-06, AC-07)*
- [x] T3.4 — Integrate one retrieval per user turn without mutating persisted history or the frozen system-prompt prefix *(verifies AC-06, AC-07, AC-15)*
- [x] T3.5 — Implement best-effort usage accounting that cannot delay/fail a turn *(verifies AC-12)*
- [x] T3.6 — Add deterministic ranking, diversity, prompt-prefix snapshot and graceful-degradation tests *(verifies AC-06, AC-07, AC-12)*

> Commit this coherent retrieval/context unit on `development`, staging only its explicit files.

## Phase 4 — Commands, private tools and lifecycle

- [x] T4.1 — Add the `/memory` status/list/show/mode/pause/resume/accept/reject/doctor/export/clear command family *(verifies AC-02, AC-11, AC-13, AC-14)*
- [x] T4.2 — Add `/remember` and `/forget` with ambiguity previews and destructive confirmation *(verifies AC-03, AC-10, AC-13)*
- [x] T4.3 — Add strict private `proposeMemory` and read-only `recallMemory` schemas/handlers without exposing storage primitives *(verifies AC-04, AC-06, AC-07)*
- [x] T4.4 — Add sanitized memory UI components through `src/ui/` and document their visual contract *(contract synchronized during closeout after runtime scope was explicitly added; verifies AC-13, AC-16)*
- [x] T4.5 — Wire lazy initialization, session-local pause, existing dry-run and bounded lifecycle flush *(verifies AC-11, AC-12, AC-15)*
- [x] T4.6 — Implement forget/clear purging across snapshot, WAL, backup and overview plus complete quarantine removal; add a full managed-artifact content scan test *(verifies AC-10)*
- [x] T4.7 — Implement confirmed, workspace-confined, sanitized `0600` export and prove it remains separate from session `/export` *(verifies AC-14, AC-15)*
- [x] T4.8 — Add command/tool/TUI/integration tests including cancellation, 60/79/80/120-column layouts and prompt ownership *(verifies AC-13, AC-16)*

> Commit this coherent commands/tools/UI integration unit on `development`, staging only its explicit files.

## Phase 5 — Testing, security and verification

- [x] T5.1 — Run `node --check` on every touched source file and record full results
- [x] T5.2 — Run targeted memory, agent, tool, command, lifecycle, history and UI tests; triage every failure *(verifies AC-01 through AC-16)*
- [x] T5.3 — Run `npm run lint` and `npm test`; record warnings, failures and limitations
- [x] T5.4 — Run the verbose smoke test in isolated temporary home/workspace state without real credentials
- [x] T5.5 — Run and record the manual two-workspace workflow below
- [x] T5.6 — Run the negative fault/path/privacy/deletion matrix below
- [x] T5.7 — Verify all acceptance criteria individually and update the verification log
- [x] T5.8 — Run `npm audit` only if implementation adds a dependency; not applicable because the implementation adds no dependency

### Manual two-workspace workflow

| Step | Expected result | Actual result |
|------|-----------------|---------------|
| Start isolated Emile in workspace A and inspect `/memory` | `ask`, healthy empty global V1 store; no workspace memory directory | ✅ Isolated root initialized as `ask`/healthy; workspace A had no `.emile` copy |
| `/remember` a synthetic style preference, then inspect/list it | One active explicit record, bounded sanitized display | ✅ Explicit record became active; command/UI tests verified bounded sanitized display |
| Start workspace B under the same isolated user state | The same active record is retrieved; no copied project store | ✅ Workspace B retrieved the same record from the shared root and gained no `.emile` directory |
| Submit one inferred preference in `auto`, then repeat equivalently in a distinct session | Pending after first; active only after second | ✅ Manual result `pending → active`; automated distinct-session test agrees |
| Submit a conflicting preference | Existing active record is unchanged; conflict needs user action | ✅ Same-key incompatible evidence produced `conflict` without replacing the active record |
| Pause, run a relevant turn, then resume | No retrieval/formation while paused; prior global state unchanged | ✅ Paused context returned zero records and touched no storage; resume retained state |
| Corrupt a copied fixture, leave a torn WAL tail and run doctor/startup | Bounded recovery/quarantine or read-only degradation; CLI remains usable | ✅ Corrupt store recovered from backup as degraded; torn-tail and unavailable-store cases passed automated tests |
| Forget the explicit record and scan every managed artifact | Selected content absent; media-erasure limitation disclosed | ✅ Content absent across four managed files; command UI discloses physical-media limitation |

### Negative and abuse matrix

| Scenario | Expected result | Actual result |
|----------|-----------------|---------------|
| `../` traversal, external symlink, FIFO/device at an artifact path | Reject closed; no external read/write | ✅ Traversal, external symlink and FIFO fixtures rejected; device uses the same non-regular `fstat` branch but was not created unprivileged |
| Two simultaneous writers and a stolen/stale lock token | Serialize/retry boundedly; no lost update; non-owner cannot unlock | ✅ Two first-use processes committed revisions 1 and 2; stale recovery and non-owner release tests passed |
| Failure after WAL append, temporary snapshot, backup and rename | Restart selects/replays only a valid revision | ✅ Thirteen injected checkpoints across WAL/backup/store/overview/checkpoint all recovered revision 1 |
| Malicious file/tool/web/MCP output asks to become a global rule | Proposal source validation rejects it | ✅ Exact-current-user binding plus quoted/task-scoped/unstable evidence tests reject non-user sources |
| Synthetic API key, private key and high-risk identifier | Never persisted; diagnostic contains no value | ✅ Credential, natural-language password, private-key, Bearer and CPF fixtures denied; handler response omitted values |
| Memory text attempts `--no-safe`, shell approval or instruction override | Rendered as untrusted; gates and higher priorities win | ✅ Security-bypass text denied; prompt/context regression declares and preserves authority order |
| Record/store/query/context cap overflow | Deterministic reject/truncate without crash | ✅ Schema, privacy, tool query, record count, artifact and 1,400-token/count cap tests passed |
| Ambiguous forget, cancelled clear or interrupted confirmation | No mutation; prompt/readline ownership restored | ✅ Ambiguous preview + cancellation preserved both records; shared prompt ownership/cancel suite passed |
| Forget with matching content in backup/WAL/index/quarantine | All Emile-managed copies purged | ✅ Automated nested-quarantine scan and manual four-file scan found no selected content |
| Memory store unavailable while sessions/MCP/config are valid | Normal agent operation continues without memory | ✅ Injected loader failure still produced the normal assistant response; full MCP/session/config suite passed |

## Phase 6 — Documentation and closing

- [x] T6.1 — Update README command reference, PRD delivery status, architecture modules/flows, visual identity, security guide, glossary and roadmap to match implemented reality; keep local-only `.clinerules` out of project changes per user direction
- [x] T6.2 — Create `features/global-agent-memory.md` from the template and index it only after implementation is verified *(Rule 7)*
- [x] T6.3 — Add the implementation entry to `CHANGELOG.md`
- [x] T6.4 — Validate all touched Markdown tables, relative links and Mermaid blocks
- [x] T6.5 — Update the spec/plan status to `implemented`, record final paths/evidence and close every acceptance criterion
- [ ] T6.6 — Commit the documentation/registry closeout on `development` with explicit paths only
- [ ] T6.7 — Report commits, commands, results, residual risks and any non-executed verification in the handoff

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Manual two-workspace workflow plus `memory-store.test.js`; one injected global root, no project copy |
| AC-02 | ✅ | Initialization/mode/permission tests and isolated CLI smoke; provider config regression suite passed |
| AC-03 | ✅ | Explicit add/dedup tests and `/remember` command coverage |
| AC-04 | ✅ | Exact-source, strict-handler, quoted/task-scoped/unstable and session-redaction tests |
| AC-05 | ✅ | Ask/auto/distinct-session/conflict/accept/reject tests plus manual workflow |
| AC-06 | ✅ | Stable prompt policy and transient context tests; security-bypass content denied |
| AC-07 | ✅ | Deterministic ranking/diversity and 10 + 6 / 1,400-token cap tests |
| AC-08 | ✅ | Thirteen fault checkpoints, torn/corrupt artifacts, symlink/FIFO and concurrent/stale/stolen lock tests |
| AC-09 | ✅ | Credential/private-key/identifier/sensitive-confirmation tests with content-free diagnostics |
| AC-10 | ✅ | Forget/clear purge tests scan snapshot, WAL, backup, overview and nested quarantine |
| AC-11 | ✅ | Off, pause and dry-run tests prove no prohibited mutation or deferred usage write |
| AC-12 | ✅ | Agent continues after injected loader failure; recovery/read-only and bounded lifecycle tests passed |
| AC-13 | ✅ | Command tests cover preview, confirmation/cancellation and exact-ID management |
| AC-14 | ✅ | Exclusive workspace-confined `0600` export excludes provenance; session export remains separate |
| AC-15 | ✅ | Full 55-file suite covers session, undo, MCP, web and config compatibility; memory projection is transient |
| AC-16 | ✅ | Memory UI passed 60/79/80/120-column control-stripping tests and shared prompt/cancel regressions |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `d94bba2` | `docs(memory): design user-global agent memory` | Research, spec, plan, tasks, ADR and planned doc references |
| `41ad810` | `feat(memory): add crash-safe global store` | Capability root, schema, lock, WAL/snapshot/backup/recovery and store tests |
| `4edc8d5` | `feat(memory): add conservative learning and recall` | Privacy, formation, retrieval/context facade and tests |
| `f441e25` | `test(config): avoid shell in permission fixtures` | Restricted-environment gate fixture only |
| `e6c1173` | `feat(memory): integrate global memory with agent CLI` | Agent, commands, private tools, UI, lifecycle, redaction, fault/concurrency tests |
| `ef1e76a` | `fix(memory): reject unstable inferred evidence` | Quoted/task-scoped/unstable source gate and credential variants |
