/**
 * rules.js — project rules discovery and formatting (spec 2026-08-25-rules-system).
 *
 * Emile honors a per-project rules file, injected verbatim into the system
 * prompt as the highest-authority user constraints (always-on, unlike skills
 * which are keyword-triggered). Precedence:
 *
 *   .emilerules  →  AGENTS.md  →  .clinerules  →  .cursorrules
 *
 * A size cap keeps a huge file from bloating every request; the content is
 * local user-controlled config (the same trust model as .clinerules), never
 * executed. Results are cached by mtime so repeated system-prompt builds
 * don't re-read the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const MAX_RULES_CHARS = 12_000;

export const RULES_PRIORITY = [
  { name: '.emilerules', emile: true },
  { name: 'AGENTS.md', emile: false },
  { name: '.clinerules', emile: false },
  { name: '.cursorrules', emile: false },
];

let _cache = null; // { path, name, emile, mtimeMs, content, truncated }

function isInsideWorkspace(targetPath) {
  const workspacePath = fs.realpathSync(config.workspaceDir);
  const relative = path.relative(workspacePath, targetPath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** Finds the active rules file in the workspace root, or null. */
export function findRulesFile() {
  for (const candidate of RULES_PRIORITY) {
    const candidatePath = path.join(config.workspaceDir, candidate.name);
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const realPath = fs.realpathSync(candidatePath);
      if (!isInsideWorkspace(realPath) || !fs.statSync(realPath).isFile()) continue;
      return {
        path: candidatePath,
        realPath,
        name: candidate.name,
        emile: candidate.emile,
      };
    } catch {
      // A broken/unreadable candidate must not block the remaining fallbacks.
    }
  }
  return null;
}

/**
 * Loads the active rules content (cached by file mtime).
 * @returns {{ active: boolean, name?: string, path?: string, emile?: boolean,
 *            content?: string, truncated?: boolean, error?: string }}
 */
export function loadRules() {
  const file = findRulesFile();
  if (!file) {
    _cache = null;
    return { active: false };
  }

  try {
    const stat = fs.statSync(file.realPath);
    if (_cache && _cache.realPath === file.realPath && _cache.mtimeMs === stat.mtimeMs) {
      return { active: true, ..._cache, content: _cache.content, truncated: _cache.truncated };
    }
    let content = fs.readFileSync(file.realPath, 'utf8');
    const truncated = content.length > MAX_RULES_CHARS;
    if (truncated) {
      content = content.slice(0, MAX_RULES_CHARS) + '\n\n[— rules truncated for context —]\n';
    }
    _cache = { ...file, mtimeMs: stat.mtimeMs, content, truncated };
    return { active: true, ..._cache };
  } catch (err) {
    return { active: false, error: err.message };
  }
}

/**
 * Formats the rules into a system-prompt section, or '' when inactive.
 */
export function formatRulesBlock(rules) {
  if (!rules?.active || !rules.content) return '';
  const title = rules.emile ? '.emilerules' : rules.name;
  const suffix = rules.truncated ? ' [truncated]' : '';
  return `\n=== PROJECT RULES (${title}${suffix}) ===\n${rules.content}\n=== END PROJECT RULES ===\n`;
}
