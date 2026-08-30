// ──────────────────────────────────────────────────────────────
//  TUI Render Harness — specs/2026-08-25-tui-premium
//  Renders every conversation block in sequence so the premium
//  minimal output (tool lines, ghost thinking, command divider,
//  ↳ header, 88-col box) can be verified without an API key.
//  Run: node test-ui.js
// ──────────────────────────────────────────────────────────────
import {
  printStartupScreen,
  printConfig,
  printSessionBar,
  printUserMessage,
  startThinkingStream,
  appendThinkingStream,
  endThinkingStream,
  printAssistantResponse,
  printToolSummary,
  printDiffBlock,
} from './src/ui/index.js';
import { config } from './src/config.js';
import { createSpinner } from './src/ui/spinner.js';

// 1. Startup Screen
printStartupScreen('1.0.0');

// 2. Simulated MCP spinner (no interference)
const mcpSpinner = createSpinner();
mcpSpinner.start('Connecting to MCP servers...');
await new Promise(r => setTimeout(r, 400));
mcpSpinner.stop('MCP ready (1 server, 13 tools)', '✓');
console.log();

// 3. Config panel — "off" states render dim, "on" green
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

console.log('\n  ── Simulated turn · default (expanded thinking) ──\n');

// 5a. User message — command divider
printUserMessage('Add input validation to src/api.js');

// 5b. Thinking stream, expanded (default): live muted stream → duration header
startThinkingStream();
appendThinkingStream('The user wants validation in the API layer. I should check the existing config schema first, then add zod parsing at the boundary.');
await new Promise(r => setTimeout(r, 100));
appendThinkingStream(' The file exports a createChatCompletion function; validation belongs in config.js where keys are resolved.');
await new Promise(r => setTimeout(r, 100));
endThinkingStream();

// 5c. Tool calls — grid-aligned lines, semantic colors
printToolSummary([
  { function: { name: 'readFile',   arguments: JSON.stringify({ path: 'src/config.js' }) } },
  { function: { name: 'editFile',   arguments: JSON.stringify({ path: 'src/config.js' }) } },
  { function: { name: 'runCommand', arguments: JSON.stringify({ command: 'npm test -- --runInBand --coverage --reporter=verbose' }) } },
  { function: { name: 'grepSearch', arguments: JSON.stringify({ query: 'image|vision|base64|image_url' }) } },
  { function: { name: 'listDir',    arguments: JSON.stringify({ path: '.' }) } },
]);

// 5c-bis. Diff block — open style (top/bottom only), line numbers + colors
printDiffBlock('src/config.js', [
  { value: 'const apiKey = config.apiKey;\n', removed: true },
  { value: '// Validate the key at the boundary before any request\nconst apiKey = z.string().min(1).parse(config.apiKey);\n', added: true },
  { value: 'export function hasCredentials() {\n  return Boolean(config.apiKey);\n}\n', count: 0 },
]);

// 5d. Response — `↳ N tools` header + 88-col box
printAssistantResponse(
  'I\'ll add validation to the config layer.\n\n' +
  '**Plan:**\n\n' +
  '1. Read `src/config.js`\n' +
  '2. Add a zod schema\n' +
  '3. Validate at the boundary\n\n' +
  '```js\nconst schema = z.object({ apiKey: z.string() });\n```'
);

console.log('\n  ── Simulated turn · collapsed thinking (/thinking) ──\n');

config.expandThinking = false;

printUserMessage('Why did the fallback model fail?');
startThinkingStream();
appendThinkingStream('The paid model returned 401. The key may be invalid or expired, so the loop falls back to openrouter/free.');
await new Promise(r => setTimeout(r, 100));
endThinkingStream();

printToolSummary([
  { function: { name: 'grepSearch', arguments: JSON.stringify({ query: 'FREE_FALLBACK_MODEL' }) } },
]);

printAssistantResponse('The paid provider returned **401 Unauthorized**, so the agent loop fell back to `openrouter/free` without losing context.');

// Restore the expanded default for the session bar + prompt stand-in
config.expandThinking = true;

// 6. Session bar + prompt gap
printSessionBar({
  sessionId: 'session_1785abcdef',
  model: 'anthropic/claude-3-5-sonnet',
  messageCount: 4,
  stats: { lastPromptTokens: 14200, contextLimit: 128000 },
});

// The prompt block itself requires a TTY (raw mode) — render the gap + a
// static stand-in so the session-bar-to-prompt spacing is verifiable.
console.log();
process.stdout.write('  ' + '\x1B[2m' + '─'.repeat(Math.min((process.stdout.columns || 80) - 4, 88)) + '\x1B[0m' + '\n');
process.stdout.write('  \x1B[38;2;122;162;247m❯\x1B[0m \n');
process.stdout.write('  \x1B[38;2;224;175;104mplan (tab)\x1B[0m \x1B[38;2;86;95;137m· claude-3-5-sonnet (low) · tokens: 14.2k / 128k (11%)\x1B[0m\n');

console.log('\n  ✅ TUI render harness complete! ✅\n');
