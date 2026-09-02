# Plan: Site 1874 Identity Overhaul

> Companion to [`spec.md`](./spec.md). Status: `draft`.

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-site-1874-identity` |
| **Status** | `draft` |

---

## 1. Technical Approach

The site is a small Astro 5 project (`emile-site/`) with Tailwind v4 via `@tailwindcss/vite`, two pages (`index.astro`, `install.astro`), a `Base` layout, two components (`Station`, `BaudotEncoder`), one shared lib (`lib/baudot.js`), and a single `global.css` design system. The 1874 identity overhaul stays inside this footprint:

1. **Layer the period look in CSS, not in markup.** Most of the work is a redesigned `global.css` that adds a new "Impression" theme on top of the existing tokens. Existing components and pages are restyled via new utility/component classes; no structural rewrite.
2. **Bring in two Google Fonts:** a transitional/didone display face for the masthead and chapter heads (default: **Cormorant Garamond**) and a period text face for body copy (default: **EB Garamond**). Mono stays as JetBrains Mono for code, ticker, and Baudot frames. The existing `link rel="stylesheet"` in `Base.astro` is updated to load the new families.
3. **Add a paper texture** as a small inline SVG noise pattern (`<feTurbulence>` + `<feColorMatrix>`) referenced by `background-image: url("data:image/svg+xml;utf8,...")`, so it ships zero extra network requests. Opacity is bounded (~5% in light, ~3% in dark) so contrast is preserved.
4. **Add ornamental components** as Astro partials (no runtime):
   - `<Fleuron />` — a single typographic ornament glyph (e.g. ❧, ❦, or a small custom SVG of a printer's flower).
   - `<Rule />` — a hairline horizontal rule with a centered glyph (the "── ◆ ──" treatment).
   - `<DropCap letter="E">…</DropCap>` — a CSS-only drop cap using `::first-letter`.
   - `<Masthead />` — a header section with name + Paris + MDCCCLXXIV date + nav.
   - `<Stamp text="BREVET · 1874" />` — an inline block styled like a rubber/ink stamp.
5. **Reframe the home page** as a chapter sequence (I–V) using the existing `<Station>` component but with a chapter-mark component wrapping it. Add an epigraph block, a "letter from the editor" block, and a printer's mark in the footer.
6. **Re-verify** the existing visual debt that was previously on the open list — narrow widths, dark mode contrast, code-block legibility — as part of the same CSS pass.

No new Astro integrations, no new pages, no new components that ship JS, no new npm dependencies.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (tech stack — Astro + Tailwind). The change is purely stylistic and stays inside the existing stack. No new ADR needed.
- **Architecture document:** the site architecture (Astro static + shared `Base` layout) is preserved. `docs/architecture.md` describes the **CLI** architecture, not the marketing site, so no update is required there.
- **Design system:** `emile-site/README.md` already declares a Design Rules section; the spec extends it. The contrast audit comment block at the top of `global.css` is updated to document every new color pair.

## 3. Security and Threat Model

| Element | Handling |
|---------|----------|
| Command execution and whitelist | Not applicable. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Not applicable. |
| Secrets (API keys, sessions, exports) | Not applicable. |
| Controls and negative tests | Accessibility: every new color pair documented in the contrast audit and verified manually at 1024px and 375px. No new external network requests. No new JS. |

## 4. Impacted Modules

This spec touches **only the `emile-site/` subtree** of the repo.

| Module | Path | Change |
|--------|---------|--------|
| Global design system | `emile-site/src/styles/global.css` | Major rewrite: new paper texture, new type scale, new ornamental utilities, new dark-mode mapping, contrast audit update. |
| Site layout | `emile-site/src/layouts/Base.astro` | Add Google Fonts link update, masthead block, printer's mark in footer, theme bootstrap unchanged. |
| Section marker | `emile-site/src/components/Station.astro` | Restyle: chapter roman numerals, fleuron rule, drop-cap support via class. |
| Encoder | `emile-site/src/components/BaudotEncoder.astro` | Restyle wrapper to match period treatment; keep the inline client script intact. |
| New component | `emile-site/src/components/Masthead.astro` | New: site name, date line, fleuron, nav. |
| New component | `emile-site/src/components/Fleuron.astro` | New: single typographic ornament + optional `Rule` slot. |
| New component | `emile-site/src/components/Stamp.astro` | New: "BREVET · 1874" / "PARIS · MDCCCLXXIV" stamp block. |
| New component | `emile-site/src/components/Epigraph.astro` | New: small italicized epigraph block with optional source. |
| New component | `emile-site/src/components/Colophon.astro` | New: printer's mark for the footer. |
| Home page | `emile-site/src/pages/index.astro` | Restructure: masthead → epigraph → chapter sequence → letter from the editor → CTA. |
| Install page | `emile-site/src/pages/install.astro` | Restyle only: same content, period treatment, chapter sequence. |
| Site README | `emile-site/README.md` | Update "Design rules" section to document the new period treatment. |

## 5. Impacted Flags / Slash Commands / Tools

None. The site is a marketing surface; it has no CLI flags, no slash commands, and no tools.

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|------|------|
| Modify | `emile-site/src/styles/global.css` | New paper theme, new type scale, new ornamental utilities, contrast audit update. |
| Modify | `emile-site/src/layouts/Base.astro` | Update fonts link, replace inline header/footer with new components. |
| Modify | `emile-site/src/components/Station.astro` | Chapter numerals, fleuron rule, drop-cap class. |
| Modify | `emile-site/src/components/BaudotEncoder.astro` | Restyle wrapper. |
| Create | `emile-site/src/components/Masthead.astro` | Header block. |
| Create | `emile-site/src/components/Fleuron.astro` | Ornament + rule. |
| Create | `emile-site/src/components/Stamp.astro` | Brevet stamp. |
| Create | `emile-site/src/components/Epigraph.astro` | Epigraph block. |
| Create | `emile-site/src/components/Colophon.astro` | Footer printer's mark. |
| Modify | `emile-site/src/pages/index.astro` | Restructure to chapter narrative. |
| Modify | `emile-site/src/pages/install.astro` | Restyle only. |
| Modify | `emile-site/README.md` | Update Design rules section. |

## 7. Technical Decisions (summary)

| Decision | Rationale |
|---------|-----------|
| Stick with Astro + Tailwind v4, no new integrations. | The stack already works; adding Astro integrations or a new framework is out of scope and would change the build. |
| Use Google Fonts (CDN) for Cormorant Garamond + EB Garamond. | Adds zero build complexity. Document trade-off in the plan; the `preconnect` is already in place. |
| Paper texture as inline SVG data URI. | Zero network requests, scales infinitely, ≤ 4 KB. |
| Use Unicode ornaments (❧, ❦, ✦, §, ¶) as the primary fleurons. | Authentic to 19th-century type, zero-cost, screen-reader friendly via `aria-hidden`. |
| Map "Chapters" via a new `<Chapter>` component, but keep `<Station>` for backward compat. | Stations already represent sections; chapter adds a Roman numeral and ornament without removing the existing API. |
| Use `::first-letter` for drop caps. | Pure CSS, no JS, no markup change. |
| No JavaScript additions. | Astro static-first principle and the spec's RF-S10. |
| No animation. | Spec requires no animation, respects `prefers-reduced-motion`. |

## 8. Verification Strategy and Gates

| AC | Check | Command / evidence |
|----|------|-------------------|
| AC-01 | Visual review at 1024px and 375px in light and dark modes. | Manual screenshot. |
| AC-02 | Header is non-overlapping at 375px. | DevTools responsive view. |
| AC-03 | Baudot credit text preserved (no fabricated quotes). | Diff against current `index.astro` chapter 05. |
| AC-04 | Encoder still works (type, frames, roundtrip, stats update). | Manual interaction; no console errors. |
| AC-05 | `npm run check` and `npm run build` pass. | Terminal output. |
| AC-06 | WCAG AA contrast on all new color pairs. | Manual audit + updated comment block in `global.css`. |
| AC-07 | No new third-party requests. | DevTools Network panel screenshot. |
| AC-08 | `emile-site/README.md` Design rules section updated. | Diff against the current README. |
| AC-09 | `/install` page still works and renders all 6 stations. | Manual + `npm run build`. |
| AC-10 | No animation under `prefers-reduced-motion`. | DevTools rendering panel toggle. |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/site-1874-identity` (created from `development` if missing). |
| **Documentation branch** | `docs/documentation` for README updates and any docs notes. |
| **Commit plan** | (1) New components, (2) global.css rewrite, (3) layout/pages restyle, (4) README update. Each commit stages only its own files — never `git add .`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | Not applicable. |
| Interruption (Ctrl+C / Esc) and readline state | Not applicable. |
| Partial state (session, undo stack, file cache) | Not applicable. |
| Rollback / undo | Each commit is a coherent unit; revert by commit hash. The `dist/` build is reproducible from the source. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|------------|
| Period type may feel kitsch if pushed too hard. | Medium | Restrain weights and ornaments; verify visually before final commit. |
| Paper texture hurts contrast or looks muddy. | Medium | Bound opacity to ≤ 6% in light and ≤ 3% in dark; verify in both modes. |
| Drop caps break at narrow widths. | Low | `@media (max-width: 480px) { .dropcap::first-letter { float: none; font-size: 1em; } }`. |
| Two new Google Fonts increase LCP. | Low | `preconnect` already in place; `display=swap` already on. Document the trade-off; consider self-hosting in a follow-up. |
| New ornamental Unicode glyphs render differently across systems. | Low | Pin to a small set (❧ ❦ ✦ § ¶) and provide a CSS-only fallback ornament. |
