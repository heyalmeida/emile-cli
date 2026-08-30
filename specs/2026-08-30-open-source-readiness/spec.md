# Spec: Contributor lint and CI gates

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-open-source-readiness` |
| **Status** | `implemented` |
| **Phase/Context** | Open-source readiness / backlog items 8.1 and 8.2 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Goal

Give contributors reproducible `npm test` and `npm run lint` commands and run both automatically on pushes and pull requests through GitHub Actions.

## 2. Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | `npm run lint` runs ESLint over `src/`, `test/` and `bin/`. | Must |
| RF-S02 | The linter uses a committed ES module/Node configuration and exits nonzero on correctness errors. | Must |
| RF-S03 | CI runs install, lint and tests on push and pull request using Node 20. | Must |
| RF-S04 | Existing `npm test` behavior remains unchanged. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes dependency and contributor gates, not runtime behavior. |
| **Assets/secrets** | Lockfile and CI environment; no secrets are required. |
| **Untrusted inputs** | CI checks repository code only; workflows pin official actions to major versions. |
| **Negative criteria** | CI must not run with credentials or disable tests; lint warnings may be triaged but correctness errors fail the job. |

## 4. Acceptance Criteria

- **AC-01:** `npm run lint` exits successfully on the current source tree.
- **AC-02:** `npm test` remains successful.
- **AC-03:** `.github/workflows/ci.yml` runs lint and test on push/pull_request with Node 20.

## 5. References

- `IMPROVEMENTS.md` §§8.1–8.2
- `package.json`, `package-lock.json`
