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
  ghost:   (s) => `${rgb(59,66,97)}${s}${RESET}`,      // #3B4261 near-invisible (thinking)
  success: (s) => `${rgb(158,206,106)}${s}${RESET}`,   // #9ECE6A green
  warn:    (s) => `${rgb(224,175,104)}${s}${RESET}`,   // #E0AF68 amber
  info:    (s) => `${rgb(125,207,255)}${s}${RESET}`,   // #7DCFFF cyan
  red:     (s) => `${rgb(247,118,142)}${s}${RESET}`,   // #F7768E red
  fg:      (s) => `${rgb(169,177,214)}${s}${RESET}`,   // #A9B1D6 foreground
  dim:     (s) => `${ESC}[2m${s}${RESET}`,
  bold:    (s) => `${ESC}[1m${s}${RESET}`,
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

// Format a token count with a `k` suffix (128000 → 128k, 14200 → 14.2k)
export function fmtK(n) {
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
    return `  ${C.muted('╭─')} ${label} ${C.muted('─'.repeat(fill))}`;
  }
  return `  ${C.muted('╭' + '─'.repeat(Math.max(width - 1, 0)))}`;
}

export function boxBottomOpen(width) {
  return `  ${C.muted('╰' + '─'.repeat(Math.max(width - 1, 0)))}`;
}
