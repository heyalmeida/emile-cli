// Command registry for the interactive CLI.
// The REPL owns lifecycle/input handling; command behavior lives in handlers.js.
import {
  handleConnect,
  handleModel,
  handleSessions,
  handleNewSession,
  handleRewind,
  handleThinking,
  handleMaxLoop,
  handleWebSearch,
  handleTavily,
  handleFirecrawl,
  handleHelp,
  handleUndo,
  handleCost,
  handleExport,
  handleRules,
  handleSkills,
} from './handlers.js';
import { handleForget, handleMemory, handleRemember } from './memory.js';

const COMMANDS = new Map([
  ['/connect', handleConnect],
  ['/model', handleModel],
  ['/switch', handleSessions],
  ['/sessions', handleSessions],
  ['/new', handleNewSession],
  ['/clear', handleNewSession],
  ['/rewind', handleRewind],
  ['/thinking', handleThinking],
  ['/maxloop', handleMaxLoop],
  ['/websearch', handleWebSearch],
  ['/tavily', handleTavily],
  ['/firecrawl', handleFirecrawl],
  ['/help', handleHelp],
  ['/undo', handleUndo],
  ['/cost', handleCost],
  ['/export', handleExport],
  ['/rules', handleRules],
  ['/skills', handleSkills],
  ['/skill', handleSkills],
  ['/memory', handleMemory],
  ['/remember', handleRemember],
  ['/forget', handleForget],
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

export { matchCommands, buildHelpTable, listRootCommands } from './registry.js';
