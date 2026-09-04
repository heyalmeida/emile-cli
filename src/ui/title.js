// title.js — dynamic terminal-window title driven by real runtime activity.
import { stripTerminalControls } from './control.js';

export const MAX_TERMINAL_TITLE_LENGTH = 100;

let titleState = {
  activity: 'starting',
  workspace: '',
  model: '',
};
let lastWrittenTitle = '';

export function sanitizeTitlePart(value, maxLength = 40) {
  return stripTerminalControls(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function lastPathSegments(value, count = 2) {
  const clean = stripTerminalControls(value).replace(/\\/g, '/');
  const segments = clean.split('/').filter(Boolean);
  return sanitizeTitlePart(segments.slice(-count).join('/'), 60);
}

function shortModel(value) {
  const clean = sanitizeTitlePart(value, 64);
  return clean.split('/').filter(Boolean).pop() || '';
}

export function formatTerminalTitle({ activity = '', workspace = '', model = '' } = {}) {
  const parts = [
    sanitizeTitlePart(activity, 40),
    'emile',
    lastPathSegments(workspace, 1),
    shortModel(model),
  ].filter(Boolean);

  return sanitizeTitlePart(parts.join(' · '), MAX_TERMINAL_TITLE_LENGTH);
}

export function createTerminalTitleSequence(title) {
  return `\x1B]0;${sanitizeTitlePart(title, MAX_TERMINAL_TITLE_LENGTH)}\x07`;
}

export function canWriteTerminalTitle({ isTTY = process.stdout.isTTY, term = process.env.TERM } = {}) {
  return Boolean(isTTY) && term !== 'dumb';
}

export function writeTerminalTitle(title, { stdout = process.stdout, term = process.env.TERM } = {}) {
  if (!canWriteTerminalTitle({ isTTY: stdout?.isTTY, term })) return false;
  try {
    stdout.write(createTerminalTitleSequence(title));
    return true;
  } catch {
    // A title update is best-effort UI and must never crash the CLI.
    return false;
  }
}

function refreshTerminalTitle() {
  const title = formatTerminalTitle(titleState);
  if (!title || title === lastWrittenTitle) return;
  if (writeTerminalTitle(title)) lastWrittenTitle = title;
}

export function configureTerminalTitle({ workspace, model } = {}) {
  if (workspace !== undefined) titleState.workspace = lastPathSegments(workspace, 1);
  if (model !== undefined) titleState.model = sanitizeTitlePart(model, 64);
  refreshTerminalTitle();
}

export function setTerminalActivity(activity) {
  titleState.activity = sanitizeTitlePart(activity, 40);
  refreshTerminalTitle();
}

export function getCurrentTerminalTitle() {
  return formatTerminalTitle(titleState);
}

export function describeToolActivity(toolCall) {
  const name = sanitizeTitlePart(toolCall?.function?.name, 48);
  let args = {};
  try {
    args = JSON.parse(toolCall?.function?.arguments || '{}');
  } catch {
    // The handler will report invalid JSON; the title still uses a safe label.
  }

  const filePath = lastPathSegments(args.path, 2);
  if (name === 'readFile') return filePath ? `reading ${filePath}` : 'reading file';
  if (name === 'writeFile') return filePath ? `writing ${filePath}` : 'writing file';
  if (name === 'editFile') return filePath ? `editing ${filePath}` : 'editing file';
  if (name === 'listDir') return 'listing files';
  if (name === 'findFiles') return 'finding files';
  if (name === 'grepSearch') return 'searching code';
  if (name === 'searchWeb') return 'searching web';
  if (name === 'browsePage') return 'reading web page';
  if (name === 'runCommand') return 'running command';
  if (name === 'proposeMemory') return 'reviewing memory';
  if (name === 'recallMemory') return 'recalling memory';
  if (name === 'createPlan') return 'creating plan';
  if (name === 'updateTask') return 'updating plan';

  const genericName = name.includes('__') ? name.split('__').pop() : name;
  const readableName = sanitizeTitlePart(genericName.replace(/[_-]+/g, ' '), 30);
  return readableName ? `using ${readableName}` : 'using tool';
}
