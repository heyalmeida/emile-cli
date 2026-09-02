// header.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C } from './theme.js';

// ──────────────────────────────────────────────────────────────
//  ZONA 1: Header — Banner + Session Info
// ──────────────────────────────────────────────────────────────

export function buildStartupScreenLines(version = '1.0.0') {
  return [
    `  ${C.muted('·')} ${C.bold(C.accent('emile'))} ${C.muted(`v${version}`)}`,
    `  ${C.muted('Developer coding agent')}`,
  ];
}

export function printHeader(version = '1.0.0') {
  console.log();
  process.stdout.write(`${buildStartupScreenLines(version).join('\n')}\n`);
  console.log();
}

export function printStartupScreen(version = '1.0.0') {
  printHeader(version);
}
