// Command registry: declarative table of root commands, their subcommands,
// descriptions and optional argument completers. The interactive REPL uses
// it to (a) render rich autocomplete previews and (b) power the /help table.
// Dispatch is still done in commands/index.js and the per-command handlers
// — the registry is the data layer for help and autocomplete only.
//
// Schema:
//   root:        string  — the slash command (e.g. '/memory')
//   subcommand:  string|null — null for the root itself, or the sub-token
//   description: string  — single-line human description
//   args:        string  — short hint of the argument shape (e.g. '<id>')
//                         shown next to the description in the autocomplete
//   complete:    function(ctx, partial) -> string[]  — optional; returns
//                         the available values for the next positional arg

import { listGlobalMemories } from '../memory/index.js';

function memorySubcommands() {
  return [
    { subcommand: null,        description: 'Show memory status, counts and mode',       args: '' },
    { subcommand: 'list',      description: 'List memory records (optional query)',     args: '[query]' },
    { subcommand: 'show',      description: 'Show one record by id',                     args: '<id>' },
    { subcommand: 'accept',    description: 'Accept a pending candidate (autocompletes pending ids)', args: '<id>' },
    { subcommand: 'reject',    description: 'Reject a pending candidate',                args: '<id>' },
    { subcommand: 'mode',      description: 'Set the global memory mode',                args: '<off|ask|auto>' },
    { subcommand: 'pause',     description: 'Pause memory for the current process',      args: '' },
    { subcommand: 'resume',    description: 'Resume memory for the current process',     args: '' },
    { subcommand: 'confirm-on',description: 'Re-enable the pending-confirm modal',       args: '' },
    { subcommand: 'confirm-off',description: 'Disable the pending-confirm modal',        args: '' },
    { subcommand: 'doctor',    description: 'Diagnose store health',                     args: '' },
    { subcommand: 'export',    description: 'Export memory to a workspace-confined file',args: '<filename>' },
    { subcommand: 'clear',     description: 'Clear every memory record (confirmed)',     args: '' },
  ];
}

function memoryModeValues() {
  return ['off', 'ask', 'auto'];
}

function pendingMemoryIds(ctx) {
  try {
    const records = listGlobalMemories('', { root: ctx.memoryRoot, dryRun: ctx.config?.dryRun === true }).records;
    return records.filter(r => r.state === 'pending').map(r => r.id);
  } catch {
    return [];
  }
}

const ROOT_COMMANDS = [
  { root: '/connect',   description: 'Configure API provider and key' },
  { root: '/model',     description: 'Select the active AI model' },
  { root: '/switch',    description: 'Switch to a previous session' },
  { root: '/sessions',  description: 'List/switch sessions (or `clean <days>`)' },
  { root: '/new',       description: 'Start a new clean session' },
  { root: '/clear',     description: 'Alias of /new' },
  { root: '/rewind',    description: 'Rewind & edit your last message' },
  { root: '/undo',      description: 'Revert the last file modification (or /undo <N>)', args: '[N]' },
  { root: '/cost',      description: 'Show token usage and costs' },
  { root: '/export',    description: 'Export session as Markdown', args: '[--export-thinking]' },
  { root: '/rules',     description: 'Inspect user-authored project rules' },
  { root: '/skills',    description: 'Search available workspace skills' },
  { root: '/skill',     description: 'Alias of /skills' },
  { root: '/memory',    description: 'Inspect and control global memory (see subcommands)' },
  { root: '/remember',  description: 'Store an explicit global preference' },
  { root: '/forget',    description: 'Forget global memory by id or query' },
  { root: '/thinking',  description: 'Toggle reasoning visibility' },
  { root: '/maxloop',   description: 'Set agent loop iteration cap', args: '<n>' },
  { root: '/websearch', description: 'Control web search (on|off|status|native|enhanced)' },
  { root: '/tavily',    description: 'Configure Tavily (on|off|status)' },
  { root: '/firecrawl', description: 'Configure Firecrawl (on|off|status)' },
  { root: '/help',      description: 'Display this help table' },
  { root: 'exit',       description: 'Quit the CLI' },
];

const SUBCOMMANDS = [
  // /memory
  ...memorySubcommands().map(entry => ({
    root: '/memory', ...entry, complete: completeMemorySubcommand(entry.subcommand),
  })),
  // /websearch
  ...['on', 'off', 'status', 'native', 'enhanced'].map(value => ({
    root: '/websearch', subcommand: value, description: `Web search: ${value}`, args: '',
  })),
  // /tavily and /firecrawl
  ...['on', 'off', 'status'].flatMap(value => ['/tavily', '/firecrawl'].map(root => ({
    root, subcommand: value, description: `${root} ${value}`, args: '',
  }))),
  // /sessions clean
  {
    root: '/sessions', subcommand: 'clean',
    description: 'Delete sessions older than N days', args: '<days>',
  },
  // /maxloop
  {
    root: '/maxloop', subcommand: null, description: 'Set agent loop iteration cap', args: '<n>',
  },
  // /undo
  { root: '/undo', subcommand: null, description: 'Revert the last N file modifications', args: '[N]' },
];

function completeMemorySubcommand(subcommand) {
  if (subcommand === 'mode') return (ctx) => memoryModeValues();
  if (subcommand === 'accept' || subcommand === 'reject') return (ctx) => pendingMemoryIds(ctx);
  return null;
}

/**
 * Returns the autocomplete suggestions for a given prompt draft.
 *
 * Two layers:
 *  1. If the draft is a single token (no space), suggest matching root commands.
 *  2. If the draft has a space, parse the first token as a root command, then
 *     suggest its matching subcommands. If the root has no subcommands, return
 *     a single match for the root itself (so the user can still autocomplete
 *     e.g. /undo <N>).
 *
 * Each match is shaped as { name, desc, ... } and is consumed by the
 * persistent prompt layout. The `name` is what gets inserted when the user
 * accepts a match; `desc` is shown as a muted preview next to the name.
 */
export function matchCommands(input = '', ctx = {}) {
  if (!input.startsWith('/')) return [];
  const endsWithSpace = input.endsWith(' ') && input.length > 1;
  // Tokenize: keep trailing empty token when input ends with space so we
  // can tell "user wants subcommand list" from "user is typing the subcommand".
  const tokens = endsWithSpace
    ? [...input.trimEnd().split(/\s+/), '']
    : input.split(/\s+/);
  const root = tokens[0];

  // Single-token input: complete the root command.
  if (tokens.length === 1) {
    return ROOT_COMMANDS
      .filter(cmd => cmd.root.startsWith(root))
      .map(cmd => ({ name: cmd.root, desc: cmd.description }));
  }

  const rootEntry = ROOT_COMMANDS.find(cmd => cmd.root === root);
  if (!rootEntry) return [];
  const realSubs = SUBCOMMANDS.filter(s => s.root === root && s.subcommand);

  // Root with no real subcommands (e.g. /maxloop, /undo): keep showing the
  // root even when the user typed a space.
  if (realSubs.length === 0) {
    return [{ name: rootEntry.root, desc: rootEntry.description }];
  }

  const partial = tokens[1] || '';
  const argToken = tokens[2] || '';

  // User has typed the subcommand fully (or the input is past the subcommand):
  // use the subcommand's `complete` callback to suggest argument values.
  if (tokens.length >= 3) {
    const subEntry = realSubs.find(s => s.subcommand === partial);
    if (subEntry && typeof subEntry.complete === 'function') {
      const values = subEntry.complete(ctx, argToken);
      return values
        .filter(v => v.startsWith(argToken))
        .map(v => ({ name: v, desc: `argument for /${root.slice(1)} ${subEntry.subcommand}` }));
    }
    return [];
  }

  // tokens.length === 2. If the user ended with a space, treat it as
  // "list the subcommands" (when partial is empty) or "show arguments for
  // the just-confirmed subcommand" (when partial is a known subcommand).
  if (endsWithSpace && partial !== '') {
    const subEntry = realSubs.find(s => s.subcommand === partial);
    if (subEntry && typeof subEntry.complete === 'function') {
      const values = subEntry.complete(ctx, '');
      return values.map(v => ({ name: v, desc: `argument for /${root.slice(1)} ${subEntry.subcommand}` }));
    }
    return [];
  }

  // Otherwise the user is still typing the subcommand: filter by prefix.
  return realSubs
    .filter(s => s.subcommand.startsWith(partial))
    .map(s => ({
      name: `${root} ${s.subcommand}`,
      desc: s.description,
    }));
}

/**
 * Returns the help table: every root command and every subcommand, in a
 * stable, line-oriented shape suitable for a markdown/ANSI table.
 */
export function buildHelpTable() {
  const rows = [];
  for (const root of ROOT_COMMANDS) {
    const subs = SUBCOMMANDS.filter(s => s.root === root.root);
    if (subs.length === 0) {
      rows.push({ root: root.root, sub: '—', args: root.args || '', desc: root.description });
    } else {
      for (const sub of subs) {
        rows.push({
          root: root.root,
          sub: sub.subcommand || '—',
          args: sub.args || '',
          desc: sub.description,
        });
      }
    }
  }
  return rows;
}

export function listRootCommands() {
  return ROOT_COMMANDS.map(cmd => ({ name: cmd.root, desc: cmd.description }));
}
