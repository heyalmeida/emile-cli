# Feature: Open-source quality gates

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-30 |
| **Source spec** | `specs/2026-08-30-open-source-readiness` |
| **PRD RFs served** | RF-15 |
| **Owner/Area** | Contributor workflow / Quality |

## Description

Contributors can run one consistent lint command and one consistent regression
suite from the package scripts. Every push and pull request also receives the
same checks automatically in GitHub Actions.

## How It Works

`npm run lint` checks the JavaScript source, tests and executable entrypoint;
`npm test` runs the native Node test suite. The CI workflow installs the lockfile
exactly and executes both commands on Node 20.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | None |
| **Slash commands** | None |
| **Tools** | None |
| **Configuration** | `.eslintrc.json`, `package.json`, `.github/workflows/ci.yml` |
| **Applicable security gates** | `npm audit` for dependency changes; no build step |

## Where It Lives in the Code

| Layer | Main paths |
|--------|---------------------|
| Package scripts | `package.json` |
| Lint policy | `.eslintrc.json` |
| CI | `.github/workflows/ci.yml` |

## Known Limitations

The current lint pass has pre-existing unused-variable warnings. Dependency
versions are updated through the lockfile when audit advisories affect
transitive packages; no runtime build step is introduced.

## Change History

| Date | Change | Reference |
|------|--------|------------|
| 2026-08-30 | Feature created with project lint and CI gates | `specs/2026-08-30-open-source-readiness` |
