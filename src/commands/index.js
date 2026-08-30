// Command registry for the interactive CLI.
// The REPL owns lifecycle/input handling; command behavior lives in handlers.js.
import {
  handleConnect,
  handleModel,
  handleSessions,
  handleNewSession,
  handleRewind,
  handleThinking,
  handleHelp,
  handleUndo,
  handleCost,
  handleExport,
  handleRules,
} from './handlers.js';

const COMMANDS = new Map([
  ['/connect', handleConnect],
  ['/model', handleModel],
  ['/switch', handleSessions],
  ['/sessions', handleSessions],
  ['/new', handleNewSession],
  ['/clear', handleNewSession],
  ['/rewind', handleRewind],
  ['/thinking', handleThinking],
  ['/help', handleHelp],
  ['/undo', handleUndo],
  ['/cost', handleCost],
  ['/export', handleExport],
  ['/rules', handleRules],
]);

/**
 * Dispatches one exact, already-trimmed REPL command.
 * Returns false for normal prompts and unsupported slash-like input.
 */
export async function dispatchCommand(input, context) {
  const parts = String(input || '').split(/\s+/);
  const command = parts[0];
  const handler = COMMANDS.get(command);
  if (!handler) return false;
  await handler(context, parts.slice(1));
  return true;
}

export function hasCommand(input) {
  return COMMANDS.has(input);
}

export function listCommands() {
  return [...COMMANDS.keys()];
}
