import {
  printStartupScreen,
  printConfig,
  printSessionBar,
} from './src/ui.js';
import { createSpinner } from './src/spinner.js';

// 1. Startup Screen
printStartupScreen('1.0.0');

// 2. Simulated MCP spinner (no interference)
const mcpSpinner = createSpinner();
mcpSpinner.start('Connecting to MCP servers...');
await new Promise(r => setTimeout(r, 400));
mcpSpinner.stop('MCP ready (1 server, 13 tools)', '✓');
console.log();

// 3. Config (vertical layout)
printConfig({
  provider: 'openrouter',
  model: 'anthropic/claude-3-5-sonnet',
  cache: false,
  effort: 'high',
  plans: false,
  skills: 'all',
  dryRun: false,
  safeMode: false,
});

console.log();
console.log('\x1B[2m  Type \'/help\' for commands.\x1B[22m');
console.log();

// 4. Session bar
printSessionBar({
  sessionId: 'session_1785abcdef',
  model: 'anthropic/claude-3-5-sonnet',
  messageCount: 0,
  stats: { promptTokens: 0, completionTokens: 0, totalCost: 0 },
});

console.log('\n  ✅ Startup screen test complete!\n');
