// rules-panel.js — safe terminal rendering for the read-only /rules command.
import { C } from './theme.js';
import { stripTerminalControls } from './control.js';

const FALLBACK_LABEL = '.emilerules → AGENTS.md → .clinerules → .cursorrules';

export function printRulesInfo(rules, { maxChars = 12_000 } = {}) {
  console.log();

  if (rules?.error) {
    console.log(C.warn(`  Could not read project rules: ${stripTerminalControls(rules.error)}`));
    console.log();
    return;
  }

  if (!rules?.active) {
    console.log(C.muted('  No project rules found.'));
    console.log(C.muted('  Create `.emilerules` in the workspace root with your own preferences.'));
    console.log(C.muted(`  Compatible fallbacks: ${FALLBACK_LABEL}`));
    console.log();
    return;
  }

  console.log(C.muted('  Active Project Rules'));
  console.log(C.info(`  ${stripTerminalControls(rules.name)}`));
  console.log(C.muted(`  Path: ${stripTerminalControls(rules.path)}`));
  if (rules.truncated) {
    console.log(C.warn(`  Truncated at ${maxChars} characters`));
  }
  console.log();

  const content = stripTerminalControls(rules.content || '');
  for (const line of content.split('\n')) {
    console.log(`  ${line}`);
  }
  console.log();
}
