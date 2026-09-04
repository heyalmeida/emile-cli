// help.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────
//  Help Box
// ──────────────────────────────────────────────

export function printHelp() {
  const boxW = Math.min(getW(), 56);

  const cmds = [
    ['/connect',  'Configure API provider and key'],
    ['/model',    'Select the active AI model'],
    ['/switch',   'Switch to a previous session'],
    ['/new',      'Start a new clean session'],
    ['/rewind',   'Rewind & edit your last message'],
    ['/undo',     'Revert the last file modification'],
    ['/cost',     'Show token usage and costs'],
    ['/export',   'Export session as Markdown'],
    ['/rules',    'Inspect user-authored project rules'],
    ['/skills',   'Search available workspace skills (`/skill` also works)'],
    ['/memory',   'Inspect and control global memory'],
    ['/remember', 'Store an explicit global preference'],
    ['/forget',   'Forget global memory by ID or query'],
    ['/thinking', 'Toggle reasoning visibility'],
    ['/maxloop',  'Set agent loop iteration cap'],
    ['/websearch', 'Control native/enhanced web search'],
    ['/tavily',   'Configure Tavily web search'],
    ['/firecrawl','Configure Firecrawl rendering'],
    ['/help',     'Display this help menu'],
    ['exit',      'Quit the CLI'],
  ];

  console.log();
  process.stdout.write(boxTopOpen('Commands', boxW) + '\n');

  for (const [cmd, desc] of cmds) {
    const line = `${C.bold(C.accent(cmd.padEnd(13)))} ${C.muted(desc)}`;
    process.stdout.write(`${BOX_INDENT}${line}\n`);
  }

  process.stdout.write(boxBottomOpen(boxW) + '\n');
  console.log();
}
