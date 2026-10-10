// theme.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.


// ──────────────────────────────────────────────────────────────
//  Tokyo Night Color Palette
//  Primary:   #7AA2F7 → pc.blue (closest)
//  Accent:    #BB9AF7 → pc.magenta
//  Muted:     #565F89 → pc.gray
//  Success:   #9ECE6A → pc.green
//  Warning:   #E0AF68 → pc.yellow
//  Error:     #F7768E → pc.red
//  Cyan:      #7DCFFF → pc.cyan
// ──────────────────────────────────────────────────────────────

// True-color helpers (fallback to picocolors when not supported)
const ESC = '\x1B';
function rgb(r, g, b) { return `${ESC}[38;2;${r};${g};${b}m`; }
function bgRgb(r, g, b) { return `${ESC}[48;2;${r};${g};${b}m`; }
const RESET = `${ESC}[0m`;

// Palette — exported so other modules (cli.js, commands.js) can reuse the
// exact same Tokyo Night colors instead of picocolors' different ANSI shades.
export const C = {
  accent:  (s) => `${rgb(122,162,247)}${s}${RESET}`,   // #7AA2F7 blue accent
  purple:  (s) => `${rgb(187,154,247)}${s}${RESET}`,   // #BB9AF7 purple
  gold:    (s) => `${rgb(255,215,0)}${s}${RESET}`,     // #FFD700 gold (search tools)
  muted:   (s) => `${rgb(86,95,137)}${s}${RESET}`,     // #565F89 muted gray
  ghost:   (s) => `${rgb(59,66,97)}${s}${RESET}`,      // #3B4261 reserved: decorative marks only
  success: (s) => `${rgb(158,206,106)}${s}${RESET}`,   // #9ECE6A green
  warn:    (s) => `${rgb(224,175,104)}${s}${RESET}`,   // #E0AF68 amber
  info:    (s) => `${rgb(125,207,255)}${s}${RESET}`,   // #7DCFFF cyan
  red:     (s) => `${rgb(247,118,142)}${s}${RESET}`,   // #F7768E red
  fg:      (s) => `${rgb(169,177,214)}${s}${RESET}`,   // #A9B1D6 foreground
  dim:     (s) => `${ESC}[2m${s}${RESET}`,
  bold:    (s) => `${ESC}[1m${s}${RESET}`,
};

/**
 * Semantic roles — the layer every component should name instead of a hue.
 *
 * `C` answers "which color"; `ROLE` answers "what is this line", so the palette
 * can be retuned without re-deciding meaning at every call site. Every member is
 * an ALIAS into `C` (never a new value — see visual-identity § 2), which is why
 * no literal may appear in this block.
 *
 * Naming follows the reference pager where a role exists there (`user`, `agent`,
 * `thinking`, `tool`, `success`, `border`; `theme/tokyonight.rs:56-64,86-101`) and
 * uses emile's own verbs for the tool taxonomy, which describe WHY a row has a
 * color: `passive` (read/recall/fetch), `mutate` (write/edit/memory proposal),
 * `danger` (shell execution), `search` (grep/find/web), `plain` (listing) and
 * `workflow` (plan/task/MCP/unknown).
 *
 * The three-step de-emphasis scale is bound BY FUNCTION, not by darkness
 * (reference `theme/tokyonight.rs:70-74`):
 *   - `meta.punct`  — the dimmest: counts, elision markers, `(+N chars)`;
 *   - `meta.label`  — the middle: labels, footers, separators, borders, metrics;
 *   - `C.ghost`     — reserved for decorative marks inside an already-visible
 *                     line; NEVER text the user has to read, because a hardcoded
 *                     near-background gray disappears on some profiles
 *                     (reference `theme/terminal_default.rs:12-18`).
 */
export const ROLE = {
  // Who a line belongs to.
  user:     C.fg,        // the user's own words
  agent:    C.accent,    // the agent's identity label
  thinking: C.muted,     // reasoning header + body

  // Why a tool row has a color (visual-identity § 3 semantic tool colors).
  tool: {
    passive:  C.info,    // readFile, recallMemory, browsePage — informational
    mutate:   C.warn,    // writeFile, editFile, proposeMemory — changes state
    danger:   C.red,     // runCommand — side effects
    search:   C.gold,    // grepSearch, findFiles, searchWeb
    plain:    C.fg,      // listDir — low impact
    workflow: C.accent,  // createPlan, updateTask, MCP, unknown
  },

  // States: a state color reports a state, never a metric.
  success:  C.success,
  warn:     C.warn,
  running:  C.warn,     // work in progress (the thinking spinner and its label)
  error:    C.red,      // a failure mark (`✗`) or an error line

  // Diff lines.
  diff: {
    insert:  C.success,
    delete:  C.red,
    context: C.muted,
  },

  // De-emphasis by function.
  meta: {
    punct:   C.dim,
    label:   C.muted,
  },

  // Chrome.
  border: {
    box:     C.muted,
    focused: C.accent,
  },
};

// Semantic vertical spacing — use these instead of scattered '\n\n'
// (visual identity: rhythm rule). none = same group, section = between
// groups (tools → response), command = between user commands.
export const GAP = {
  none:    '',
  section: '\n',
  command: '\n\n',
};

// ──────────────────────────────────────────────────────────────
//  Width
// ──────────────────────────────────────────────────────────────

export function getW() {
  const cols = process.stdout.columns || 80;
  return Math.max(cols - 4, 60);
}

// ──────────────────────────────────────────────
//  ANSI Helpers
// ──────────────────────────────────────────────

export function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m|\x1B\[38;2;\d+;\d+;\d+m|\x1B\[48;2;\d+;\d+;\d+m/g, '');
}

export function wrapText(text, width) {
  if (text.length <= width) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf(' ', width);
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = width;
    }
    lines.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  return lines;
}

// Format a token count compactly (128000 → 128k, 14200 → 14.2k, 1M → 1M)
export function fmtK(n) {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    const value = Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(/\.0$/, '');
    return `${value}M`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(n);
}


// Shared measures for full-width blocks and box content indentation
export const BOX_INDENT = '    ';
export const MAX_BOX_W = 120;

export function boxTopOpen(label = '', width) {
  const fill = label ? Math.max(width - label.length - 4, 0) : Math.max(width - 1, 0);
  if (label) {
    return `  ${ROLE.border.box('╭─')} ${label} ${ROLE.border.box('─'.repeat(fill))}`;
  }
  return `  ${ROLE.border.box('╭' + '─'.repeat(Math.max(width - 1, 0)))}`;
}

export function boxBottomOpen(width) {
  return `  ${ROLE.border.box('╰' + '─'.repeat(Math.max(width - 1, 0)))}`;
}
