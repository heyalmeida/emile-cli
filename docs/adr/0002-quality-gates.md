# ADR-0002: Native test and lint gates

## Status

**Decided** (2026-08-30)

## Context

The project already uses Node's native test runner, but contributors had to
know the raw command and there was no consistent static correctness gate. The
repository also needs an automated check before accepting changes from pull
requests.

## Decision

- Keep `node:test` as the regression runner and expose it as `npm test`.
- Use ESLint 8 with a committed ES-module/Node configuration and expose it as
  `npm run lint` over `src/`, `test/` and `bin/`.
- Run `npm ci`, `npm run lint` and `npm test` on every push and pull request in
  GitHub Actions using Node 20.
- Treat correctness errors as failures; retain existing unused-variable output
  as warnings until the related UI refactor is completed.

## Consequences

**Positive:** contributors have discoverable local gates, CI uses the lockfile,
and the project remains buildless and native-ESM.

**Accepted limitation:** the current baseline emits pre-existing lint warnings;
they are visible in every run and are not allowed to hide errors. Dependency
audit remains a separate check whenever dependencies change.

## Alternatives considered

- Jest/Vitest: additional runtime and configuration for a suite already based
  on the native Node runner.
- TypeScript or a bundler: outside the project's no-build architecture.
