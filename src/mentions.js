// mentions.js — explicit, bounded workspace file attachments for @path.
import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { resolveSafePath } from './tools/security.js';
import { stripTerminalControls } from './ui/control.js';

export const MAX_MENTION_FILE_CHARS = 12_000;
export const MAX_MENTION_TOTAL_CHARS = 36_000;
export const MAX_MENTION_CANDIDATES = 80;

export function extractMentionPaths(prompt = '') {
  const matches = String(prompt).matchAll(/(^|\s)@([^\s@]+)/g);
  return [...new Set([...matches].map(match => match[2]).filter(Boolean))];
}

function isBinary(content) {
  return content.includes('\0');
}

export function loadMentionFile(requestedPath) {
  const displayPath = stripTerminalControls(String(requestedPath || ''));
  if (!requestedPath || path.isAbsolute(requestedPath)) {
    return { ok: false, warning: `Ignored @${displayPath}: only workspace-relative files may be attached.` };
  }
  try {
    const resolved = resolveSafePath(requestedPath);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { ok: false, warning: `Ignored @${displayPath}: not a regular file.` };
    const raw = fs.readFileSync(resolved, 'utf8');
    if (isBinary(raw)) return { ok: false, warning: `Ignored @${displayPath}: binary files cannot be attached.` };
    const relative = path.relative(config.workspaceDir, resolved).split(path.sep).join('/');
    const truncated = raw.length > MAX_MENTION_FILE_CHARS;
    return {
      ok: true,
      path: relative,
      content: truncated ? raw.slice(0, MAX_MENTION_FILE_CHARS) : raw,
      truncated,
    };
  } catch (error) {
    return { ok: false, warning: `Ignored @${displayPath}: unavailable or outside the workspace.` };
  }
}

export function compileMentionAttachments(prompt = '') {
  const attachments = [];
  const warnings = [];
  let remaining = MAX_MENTION_TOTAL_CHARS;
  for (const requestedPath of extractMentionPaths(prompt)) {
    const loaded = loadMentionFile(requestedPath);
    if (!loaded.ok) { warnings.push(loaded.warning); continue; }
    if (remaining <= 0) {
      warnings.push(`Ignored @${requestedPath}: total attachment context cap reached.`);
      continue;
    }
    const content = loaded.content.slice(0, remaining);
    const truncated = loaded.truncated || content.length < loaded.content.length;
    remaining -= content.length;
    attachments.push({ ...loaded, content, truncated });
  }
  if (attachments.length === 0) return { context: '', warnings, attachments };
  const blocks = attachments.map(item =>
    `\n<attached-file path=${JSON.stringify(item.path)}${item.truncated ? ' truncated="true"' : ''}>\n${item.content}\n</attached-file>`
  );
  return {
    context: `\n\n=== USER-ATTACHED WORKSPACE FILES ===${blocks.join('')}\n=== END USER-ATTACHED WORKSPACE FILES ===`,
    warnings,
    attachments,
  };
}

/** Bounded, read-free candidates for @ completion. */
export function findMentionCandidates(fragment = '') {
  const normalized = String(fragment).replace(/^@/, '').replace(/\\/g, '/').toLowerCase();
  const root = config.workspaceDir;
  const found = [];
  const ignored = new Set(['.git', 'node_modules', '.emile']);
  function walk(directory) {
    if (found.length >= MAX_MENTION_CANDIDATES) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= MAX_MENTION_CANDIDATES) return;
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) walk(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!normalized || relative.toLowerCase().includes(normalized)) found.push(relative);
    }
  }
  walk(root);
  return found;
}
