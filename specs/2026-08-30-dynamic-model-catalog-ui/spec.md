# Spec: Dynamic model catalog in model selection

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-dynamic-model-catalog-ui` |
| **Status** | `implemented` |
| **Phase/Context** | Model selection / backlog item 4.1 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

The model wizard still presents stale hand-maintained identifiers even though `models.js` already fetches a live OpenRouter catalog. This causes users to select models that no longer exist and hides current context/pricing metadata.

## 2. Goal

Use the live catalog in `/model` when the connected provider is OpenRouter, wait for the catalog refresh when necessary, and show each model's context and pricing while retaining a safe static/custom fallback for providers not represented by the OpenRouter source.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `/model` waits for catalog initialization before building OpenRouter options. | Must |
| RF-S02 | OpenRouter options come from the dynamic catalog and include context plus input/output pricing. | Must |
| RF-S03 | A catalog/network failure leaves the existing curated/static options and custom entry available. | Must |
| RF-S04 | No API key or secret is displayed while rendering catalog metadata. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes provider/model selection but does not execute commands or write workspace files beyond the existing config save. |
| **Assets/secrets** | API key remains in config and is never included in catalog options. |
| **Command execution / file writes** | Not applicable to catalog fetch; existing `saveUserConfig` path remains unchanged. |
| **Untrusted inputs** | Remote catalog ids and metadata are normalized to strings/numbers and rendered as labels; no catalog field is executed. |
| **Negative criteria** | Invalid/empty catalog data must not replace a usable static list; failed fetch must not throw through the interactive wizard. |

## 5. Out of Scope

- Provider-specific remote catalogs for Requesty, OpenCode Zen or OpenCode Go.
- Model capability probing or an API request before saving a selection.
- Changes to the model metadata cache format.

## 6. Acceptance Criteria

- **AC-01:** Given an active dynamic catalog and OpenRouter, when `/model` starts, then it awaits initialization and presents catalog ids rather than only the hardcoded list.
- **AC-02:** Given a catalog entry, when it is rendered, then its context and pricing are visible and bounded to a readable label.
- **AC-03:** Given no active catalog or a non-OpenRouter provider, when `/model` starts, then curated options and `custom` remain available.
- **AC-04:** Given malformed catalog metadata, when options are built, then the wizard remains usable without exposing secrets or throwing.

## 7. References

- `IMPROVEMENTS.md` §4.1
- Existing `src/models.js` catalog/cache implementation and `src/commands.js` wizard
