# Tasks: Site 1874 Identity Overhaul

> Filled in from [`plan.md`](./plan.md). Each task is small, verifiable, and traceable to an acceptance criterion. Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-site-1874-identity` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs, current `emile-site/` files) — *Rule 1 of `.clinerules`*
- [x] T0.2 — Confirm this spec and plan are `approved`
- [x] T0.3 — Classify risk: **Low** (static site, no auth, no execution, no user data)
- [x] T0.4 — Create/switch to the feature branch `feat/site-1874-identity` from `development` — *Rule 8 of `.clinerules`*

## Phase 1 — Implementation

### 1.1 — New period components

- [ ] T1.1 — Create `emile-site/src/components/Masthead.astro` (name + Paris + MDCCCLXXIV + fleuron + nav) — *verifies AC-02*
- [ ] T1.2 — Create `emile-site/src/components/Fleuron.astro` (single ornament + optional centered rule) — *verifies AC-01, AC-08*
- [ ] T1.3 — Create `emile-site/src/components/Stamp.astro` (BREVET / PARIS stamp block) — *verifies AC-01*
- [ ] T1.4 — Create `emile-site/src/components/Epigraph.astro` (italicized epigraph + optional source) — *verifies AC-05*
- [ ] T1.5 — Create `emile-site/src/components/Colophon.astro` (printer's mark for footer) — *verifies AC-05*

### 1.2 — Global design system

- [ ] T1.6 — Add new Google Fonts (Cormorant Garamond + EB Garamond) to the `Base.astro` `<link>` — *verifies AC-07*
- [ ] T1.7 — Add paper-texture inline SVG (`feTurbulence` + `feColorMatrix`) as a CSS `background-image: url(data:image/svg+xml;…)` — *verifies AC-01*
- [ ] T1.8 — Rewrite `--font-display` and add `--font-serif`; introduce a new type scale (display, h1, h2, h3, body, caption, micro) — *verifies AC-01*
- [ ] T1.9 — Add ornamental utilities (`.rule`, `.rule--ornament`, `.fleuron`, `.dropcap`, `.stamp`, `.byline`) — *verifies AC-01*
- [ ] T1.10 — Restyle `.station`, `.ticker`, `.card`, `.tag`, `.btn` to the period treatment — *verifies AC-01, AC-08*
- [ ] T1.11 — Add dark-mode mapping for every new token and verify WCAG AA — *verifies AC-06*
- [ ] T1.12 — Update the contrast audit comment block at the top of `global.css` with every new color pair and its ratio — *verifies AC-06*

### 1.3 — Layout and restyle

- [ ] T1.13 — Update `emile-site/src/layouts/Base.astro` to use `<Masthead>` and `<Colophon>` — *verifies AC-02*
- [ ] T1.14 — Restyle `emile-site/src/components/Station.astro` (chapter roman numerals, fleuron rule, drop-cap class) — *verifies AC-01*
- [ ] T1.15 — Restyle `emile-site/src/components/BaudotEncoder.astro` wrapper; leave the inline client script unchanged — *verifies AC-04*

### 1.4 — Home and install

- [ ] T1.16 — Restructure `emile-site/src/pages/index.astro` into a chapter narrative with masthead, epigraph, letter from the editor, and CTA — *verifies AC-01, AC-03, AC-08*
- [ ] T1.17 — Restyle `emile-site/src/pages/install.astro` to match the period treatment (all 6 stations, code blocks intact) — *verifies AC-09*

### 1.5 — Documentation

- [ ] T1.18 — Update `emile-site/README.md` "Design rules" section to document the period treatment with the same level of detail as the existing rules — *verifies AC-08*

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — Run `cd emile-site && npm run check` — *verifies AC-05*
- [ ] T2.2 — Run `cd emile-site && npm run build` — *verifies AC-05, AC-07, AC-09*
- [ ] T2.3 — Manual visual review at 1024px and 375px in light and dark mode — *verifies AC-01, AC-02, AC-06, AC-10*
- [ ] T2.4 — Manual interaction: type in the Baudot encoder, confirm frames / roundtrip / stats update with no console errors — *verifies AC-04*
- [ ] T2.5 — DevTools Network panel: confirm no new third-party requests — *verifies AC-07*
- [ ] T2.6 — Verify `prefers-reduced-motion: reduce` produces no animation — *verifies AC-10*
- [ ] T2.7 — Verify the Baudot credit text in chapter 05 is preserved and no fabricated quotes were introduced — *verifies AC-03*
- [ ] T2.8 — Run `npm audit` on the site (no new dependencies expected) — *verifies AC-05*
- [ ] T2.9 — Verify all 6 stations on `/install` render with the period treatment and that the page still builds — *verifies AC-09*

## Phase 3 — Documentation and Closing

- [ ] T3.1 — Update `docs/visual-identity.md` with a new section describing the site (web) identity, distinct from the TUI identity — *Rule 2*
- [ ] T3.2 — Create `features/site-1874-identity.md` and add it to the `features/README.md` index — *Rule 7*
- [ ] T3.3 — Add an `[Unreleased]` entry in `CHANGELOG.md` describing the site identity overhaul — *Rule 2*
- [ ] T3.4 — Record the entry in the spec's `Acceptance Criteria Verification Log` below
- [ ] T3.5 — Update the spec status to `implemented`
- [ ] T3.6 — Switch to `docs/documentation` and commit the documentation sync there (only explicit documentation paths — Rule 8)
- [ ] T3.7 — Record limitations, non-executed verifications, and residual risk in the handoff

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ⏳ | |
| AC-02 | ⏳ | |
| AC-03 | ⏳ | |
| AC-04 | ⏳ | |
| AC-05 | ⏳ | |
| AC-06 | ⏳ | |
| AC-07 | ⏳ | |
| AC-08 | ⏳ | |
| AC-09 | ⏳ | |
| AC-10 | ⏳ | |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|--------|
| | | |
