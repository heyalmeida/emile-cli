# Spec: Site 1874 Identity Overhaul

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-site-1874-identity` |
| **Status** | `draft` |
| **Phase/Context** | Phase 3 — Distribution (marketing site polish) |
| **Related documents** | [emile-site README](../../emile-site/README.md), [emile-site visual identity section](../../emile-site/src/styles/global.css), [Product PRD](../../docs/product.md) |

---

## 1. Problem / Motivation

The emile marketing site already references Émile Baudot (telegraph, 5-bit code, copper accent, paper palette), but the visual treatment is restrained — single accent color, one display face, modest ornamentation. The product is a *terminal* tool named after a *French telegraph engineer* in *1874*; the site currently reads as a generic developer-tool landing page with telegraph flavor rather than as a period publication about the tool.

The user explicitly asked for a stronger, more "impressa" (printed) identity — the look of a 19th-century document: ink on aged paper, type composition from the period, ornaments and rules, a sense of being a printed artifact rather than a webpage. The goal is to make the site feel like an object from 1874 that happens to describe a 2026 product, while remaining performant, accessible, and readable.

This spec is **site-only** (the `emile-site/` Astro project). It does not change the CLI, the agent loop, the API, the TUI, or any documentation in `docs/`. It does, however, change the user-facing first impression of the entire project.

## 2. Goal

Make the emile marketing site unmistakably read as a 19th-century printed document — paper, ink, ornament, period type — while keeping the content accurate, accessible (WCAG AA contrast on all text), performant (no client JS growth beyond what's needed), and free of false historical claims.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Add a paper/ink base treatment: aged-paper background texture, ink-color text, hairline rules, period-appropriate type composition (headline + body) for the entire site. | Must |
| RF-S02 | Add ornamental motifs inspired by 1870s printed documents: fleurons, hairline rules with terminal flourishes, drop caps, section markers, "engraved" borders on key cards. | Must |
| RF-S03 | Introduce a new display face (period-correct: e.g. Playfair Display, Cormorant, or a similar didone/transitional — a serif designed for display) and a period text face (e.g. EB Garamond, Cormorant Garamond) alongside the existing JetBrains Mono. | Must |
| RF-S04 | Add a "Brevet / Patent" stamp component and a "date" header (e.g. `Paris · MDCCCLXXIV`) used in the masthead/header area to anchor the 1874 framing. | Must |
| RF-S05 | Restructure the home page into a chapter-style narrative: a *masthead*, an *épigraphe* (epigraph), then numbered "chapters" (I, II, III…) replacing the current "01 · signal" station layout. | Should |
| RF-S06 | Add a "Letter from the editor" style block (a small authorial note) that contextualizes emile in 1874 terms without fabricating Baudot's own words. | Should |
| RF-S07 | Add a printer's mark / colophon in the footer. | Should |
| RF-S08 | Keep the existing interactive Baudot encoder and the install page content intact; only restyle and reframe. | Must |
| RF-S09 | Preserve dark mode: invert paper → ink (not paper) and ink → cream, keep copper accent, ensure all new text/ornament combinations meet WCAG AA. | Must |
| RF-S10 | Keep zero client-JS-by-default behavior; the existing inline script for the encoder is the only allowed client JS, and the period treatment must not require any new JS. | Must |
| RF-S11 | Document the new visual system in `emile-site/README.md` (design rules section) and update the embedded contrast audit in `global.css`. | Must |
| RF-S12 | Do not fabricate historical claims: any text that references Baudot, 1874, the telegraph, or the *baud* unit must be accurate per the existing public-domain descriptions. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Low — the marketing site is static, no user data, no auth, no command execution. |
| **Assets/secrets** | None. |
| **Command execution / file writes** | Not applicable. |
| **Untrusted inputs** | Not applicable (static site, no form submission that reaches a server). |
| **Negative criteria** | Do not introduce third-party tracking, do not add a build step beyond what Astro already does, do not increase client JS, do not add a new runtime dependency. All text must remain accessible (WCAG AA). Historical claims must remain factually accurate; do not invent quotes. |
| **Performance** | Add a paper-texture background — must be a small, efficient SVG (≤ 12 KB) or CSS-only pattern; no large raster background. Two new Google Fonts is the upper bound; consider self-hosting to keep performance. |

## 5. Out of Scope

- Building a blog, docs site, or changelog page.
- Animations, scroll effects, parallax, or anything that adds runtime JS.
- A French translation of the site (the current language is English; the period framing is in English with French/Latin touches where appropriate).
- Changes to the `docs/` directory, the README at the repo root, or any code in `src/`.
- Re-architecting the Astro project (no new integrations, no new plugins, no new pages).

## 6. Acceptance Criteria

- **AC-01:** Given any page on the site, when it renders at ≥ 1024px and at 375px, then the page reads as a printed document from the 1870s — paper background with subtle texture, ink-color body type, period display headings, ornamental rules, no rounded corners.
- **AC-02:** When a visitor looks at the masthead (header), then they see (a) the emile name, (b) a "Paris · MDCCCLXXIV" or equivalent 1874-style date line, (c) a printer's ornament or fleuron, and (d) a primary nav — without any of these elements overlapping at 375px width.
- **AC-03:** When the visitor reaches the credit/baud section, then the existing accurate description of Baudot and the baud is preserved verbatim or improved for clarity; no fabricated quotes are introduced.
- **AC-04:** When the visitor interacts with the Baudot encoder, then it still works exactly as before — typing a character updates the frames, roundtrip, and stats in real time, with no console errors.
- **AC-05:** When the visitor runs `npm run check` and `npm run build` inside `emile-site/`, then both pass with zero errors and zero new warnings; the build output's `dist/` HTML/JS still ships no client JS in the static pages other than the encoder inline script.
- **AC-06:** When the visitor toggles dark mode (via `prefers-color-scheme` or the persisted `emile-theme` localStorage key), then every new text/ornament combination meets WCAG AA contrast (≥ 4.5:1 for body, ≥ 3:1 for large/decorative). The contrast audit comment block in `global.css` is updated to document every new color pairing.
- **AC-07:** When the visitor inspects the home page in DevTools, then the page's main stylesheet is loaded from a single CSS file (or the inline-Astro equivalent) — no extra request for fonts beyond the Google Fonts link already present, and no new third-party requests.
- **AC-08:** When the visitor reads `emile-site/README.md` "Design rules" section, then the period treatment (paper, ink, type, ornaments, no rounded corners) is documented with the same level of detail as the existing rules.
- **AC-09:** When the visitor visits `/install`, then all 6 stations (requirements, install, connect, first signal, undo & safety, troubleshoot) still render with the period treatment applied, all command examples still render in the existing dark code blocks, and the page still passes `npm run check` and `npm run build`.
- **AC-10:** When the visitor views the page with `prefers-reduced-motion: reduce`, then nothing animates and no transitions run longer than 0ms.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Period type may feel kitsch if pushed too hard. | Medium | Lean on composition and ornaments; keep type sizes and weights restrained. Show a preview before committing to the final face choice. |
| Self-hosting Google Fonts vs. CDN. | Low | Keep CDN link for now to avoid new runtime concerns; document trade-off in the plan. |
| Paper texture could hurt contrast or feel muddy. | Medium | Use a very low-contrast SVG noise pattern (≤ 6% opacity) or a CSS-only radial-gradient/noise combination; verify in both light and dark mode. |
| "1874" framing could be misread as the site itself being a 1874 artifact rather than about one. | Low | Use a masthead subtitle ("A bulletin in the manner of MDCCCLXXIV") and the "Credit" chapter to make the conceit explicit. |
| Drop caps may break at narrow widths. | Low | Use `float: left` drop caps with a min-width media query; at < 480px drop caps become bold initial letters only. |
| Choice of display face: Playfair vs. Cormorant vs. a slab. | Low | Defer final pick to a small in-page comparison during implementation; default to a single safe choice (e.g. Cormorant Garamond) and offer one alternate. |

## 8. References

- Émile Baudot — https://pt.wikipedia.org/wiki/%C3%89mile_Baudot (and English equivalent): the historical anchor for the entire identity.
- Existing identity work: `emile-site/src/styles/global.css`, `emile-site/README.md`, `emile-site/src/layouts/Base.astro`, `emile-site/src/components/Station.astro`, `emile-site/src/components/BaudotEncoder.astro`.
- `docs/product.md` — what emile is, used to make sure no product claims are altered.
- Spec-Driven Development process: [`specs/README.md`](../README.md).
