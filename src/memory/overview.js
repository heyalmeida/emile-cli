import {
  MAX_OVERVIEW_BYTES,
  MAX_OVERVIEW_LINES,
} from './constants.js';

function oneLine(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    .trim();
}

export function buildMemoryOverview(state) {
  const active = state.records.filter(record => record.state === 'active');
  const pending = state.records.filter(record => record.state !== 'active');
  const candidates = [
    '# Emile Global Memory',
    '',
    '> Generated view. `store.json` is canonical; use `/memory` commands to make changes.',
    '',
    `- Mode: \`${state.mode}\``,
    `- Revision: \`${state.revision}\``,
    `- Active: \`${active.length}\``,
    `- Pending/conflicts: \`${pending.length}\``,
    '',
    '## Active',
    '',
    ...active.map(record => `- \`${record.id}\` · ${record.type}/${record.activation} · ${oneLine(record.text)}`),
    '',
    '## Pending and conflicts',
    '',
    ...pending.map(record => `- \`${record.id}\` · ${record.state}/${record.type} · ${oneLine(record.text)}`),
  ];

  const lines = [];
  for (const line of candidates) {
    if (lines.length >= MAX_OVERVIEW_LINES) break;
    const next = `${lines.join('\n')}${lines.length ? '\n' : ''}${line}\n`;
    if (Buffer.byteLength(next, 'utf8') > MAX_OVERVIEW_BYTES) break;
    lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}
