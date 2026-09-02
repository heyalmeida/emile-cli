# emile — site

Marketing site for [emile](https://github.com/mc33p/emile-cli), a terminal AI coding agent.

Visual identity is anchored in Émile Baudot's telegraph code: 5-bit symbols, paper, copper signal.

## Stack

- Astro 4 (static-first)
- Tailwind 3 (typed config, no plugins beyond typography)
- JetBrains Mono + Fraunces (Google Fonts)
- Zero client JS by default — only the Baudot encoder runs on the client

## Develop

```bash
npm install
npm run dev          # localhost:4321
npm run build        # static output to dist/
npm run preview      # serve dist/ on 0.0.0.0:4321
npm run check        # astro check (TS + content)
```

## Structure

```
src/
  components/      Station, BaudotEncoder (the on-brand signature)
  layouts/         Base.astro (shell + header + footer)
  lib/             baudot.js (ITA-2 encoder — shared server/client)
  pages/           index.astro, install.astro
  styles/          global.css (design system + Tailwind layers)
public/            favicon.svg, robots.txt
```

## Design rules

- No rounded corners. 1px hairlines only.
- One accent (copper). Red reserved for signal emphasis.
- Mono everywhere except the Fraunces display face.
- Sections are stations: `── 01 · name ──`.
- Paper background, ink text, copper accent. Dark mode inverts to graphite + cream.
