# Tasks — Persistent user configuration with protected provider credentials

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-secure-global-config` |

## Phase 0 — Preparation

- [x] T0.1 — Read the PRD, architecture, visual identity, quality/security guidance, glossary, ADR-0001, current config/wizard code and related config specs.
- [x] T0.2 — Create the approved spec and technical plan.
- [x] T0.3 — Classify the change as high risk and map credential, migration, file-write and startup boundaries.
- [x] T0.4 — Preserve the user's `maxloop` configuration and do not perform branch operations.

## Phase 1 — Implementation

- [x] T1.1 — Add global user config paths and secret-free settings serialization in `src/config.js`.
- [x] T1.2 — Add Windows DPAPI and non-Windows AES-GCM protected credential storage with per-provider entries.
- [x] T1.3 — Add safe legacy workspace-config migration and fail-closed corruption handling.
- [x] T1.4 — Update `/connect` copy without exposing secrets.
- [x] T1.5 — Add isolated subprocess tests for persistence, migration, wrong-provider isolation and secret-free output.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Focused config, command, streaming and permission tests passed: 30 tests, 28 passed and 2 Windows-only POSIX mode checks skipped. — Run focused config, command and regression tests.
- [x] T2.2 — Syntax checks passed; `npm run lint` completed with 0 errors (existing warnings only); full `npm test` reached 242 passed, 6 unrelated Windows failures and 2 skipped mode checks. — Run syntax checks, lint and the full test suite; record unrelated environment failures.
- [x] T2.3 — Real CLI E2E ran twice with the migrated per-user config: no API-key prompt, provider/model loaded, and the response stream completed. Inspection confirmed settings JSON and protected credential file contain no plaintext key. — Run isolated first-run/restart E2E and verify settings JSON contains no API key.
- [x] T2.4 — Captured CLI output, settings, credential storage and test output were checked for secret absence; no plaintext key was emitted. — Verify no secret appears in output, errors, logs, exports or test assertions.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synced README, product, architecture, security docs, changelog and feature registry. — Sync README, product, architecture, security docs, changelog and feature registry.
- [x] T3.2 — Marked spec/plan/tasks implemented after focused and E2E verification. — Mark spec/plan/tasks implemented after verification.
- [x] T3.3 — Recorded residual risk: non-Windows fallback is not an OS keychain; Windows uses DPAPI CurrentUser; full-suite Windows symlink/cwd limitations remain pre-existing. — Record residual risk and non-Windows storage limitations.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Fresh-process isolated persistence test across different workspaces loaded provider/model/key without wizard data. |
| AC-02 | ✅ | Secure-config test inspected settings and credentials files; no `apiKey` property or plaintext secret. |
| AC-03 | ✅ | Legacy migration test confirmed key loaded and removed from workspace/global JSON after protected storage. |
| AC-04 | ✅ | Windows DPAPI subprocess tests passed; non-Windows fallback is implemented and documented but not executable on this Windows host. |
| AC-05 | ✅ | Corrupt credential test failed closed for both providers without cross-provider fallback. |
| AC-06 | ✅ | Different-workspace test confirmed `resolveApiKey('requesty')` does not use the saved OpenRouter key. |
| AC-07 | ✅* | Focused tests, syntax, lint and two live CLI restart E2Es passed; full suite has 6 unrelated Windows failures and 2 skipped POSIX mode checks. |
| AC-08 | ✅ | E2E output and persisted config/credential checks contained no plaintext secret. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| — | Not created automatically | — |
