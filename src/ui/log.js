// log.js — minimal UI logging surface for low-level modules (config, mcp, api)
// that cannot import the full ui/ tree (circular-dependency constraint).
// IMPROVEMENTS.md §6.1: nothing outside ui/ writes user-facing output raw.
import { C } from './theme.js';

/** Inline Tokyo Night warning line (kept on one line, no layout break). */
export function warn(message) {
  process.stderr.write(`${C.warn(`  ⚠ ${message}`)}\n`);
}

/** Inline Tokyo Night error line. */
export function error(message) {
  process.stderr.write(`${C.red(`  ✗ ${message}`)}\n`);
}
