import fs from 'node:fs';
import path from 'node:path';
import { confirm } from '@clack/prompts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from './config.js';
import { warn } from './ui/log.js';

// Map of serverName -> { client, transport, tools: [] }
const activeServers = new Map();

// Explicit 'server__tool' -> { serverName, toolName } map, built at connect
// time. Resolution is a direct lookup — no string parsing, no collision when
// a server name itself contains '__' (IMPROVEMENTS.md §5.2).
const toolMap = new Map();
const reconnectLocks = new Map();
const reconnectTimers = new Set();
let shuttingDown = false;
let consentOverride = null;

export const MCP_RECONNECT_DELAYS = Object.freeze([500, 1000, 2000]);

// Environment variables a STDIO MCP server legitimately needs. Everything
// else (API keys, tokens, secrets) is NOT propagated to third-party child
// processes. Per-server extras come from mcp.json `env` overrides.
// (IMPROVEMENTS.md §1.3)
const MCP_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'SHELL', 'TERM', 'TMPDIR', 'TMP', 'TEMP',
  'USER', 'USERNAME', 'LOGNAME', 'XDG_RUNTIME_DIR',
  'SYSTEMROOT', 'COMSPEC', // Windows
];

function buildMcpEnv(serverEnv) {
  const base = Object.fromEntries(
    MCP_ENV_ALLOWLIST
      .filter(k => k in process.env)
      .map(k => [k, process.env[k]])
  );
  return { ...base, ...(serverEnv || {}) };
}

export function sanitizeMcpError(err) {
  let message = String(err?.message || err || 'unknown error');
  message = message.replace(/https?:\/\/[^\s)]+/gi, (candidate) => {
    try { return safeUrlForPrompt(candidate); } catch { return '[remote URL]'; }
  });
  return message.replace(/(bearer\s+)[^\s]+/gi, '$1[redacted]');
}

function consentFilePath() {
  return path.join(config.workspaceDir, '.emile', 'mcp-consent.json');
}

function readConsent() {
  try {
    const parsed = JSON.parse(fs.readFileSync(consentFilePath(), 'utf8'));
    return new Set(Array.isArray(parsed?.servers) ? parsed.servers : []);
  } catch {
    return new Set();
  }
}

function rememberConsent(serverName) {
  const servers = readConsent();
  servers.add(serverName);
  try {
    fs.mkdirSync(path.dirname(consentFilePath()), { recursive: true });
    fs.writeFileSync(consentFilePath(), JSON.stringify({ servers: [...servers].sort() }, null, 2), 'utf8');
  } catch (err) {
    warn(`Could not save MCP consent for "${serverName}": ${err.message}`);
  }
}

export function normalizeMcpTransport(serverDef = {}) {
  const transport = String(serverDef.transport || serverDef.type || 'stdio').toLowerCase();
  if (!['stdio', 'sse', 'http'].includes(transport)) {
    throw new Error(`Unsupported MCP transport: ${transport}`);
  }
  return transport;
}

export function resolveMcpHeaders(headers = {}) {
  if (headers == null) return {};
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('MCP headers must be an object.');
  }

  const resolved = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      throw new Error(`Invalid MCP header name: ${name}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`MCP header "${name}" must be a string.`);
    }
    const expanded = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, envName) => {
      if (!(envName in process.env)) {
        throw new Error(`Missing environment variable for MCP header: ${envName}`);
      }
      return process.env[envName];
    });
    if (/[\r\n]/.test(expanded)) {
      throw new Error(`Invalid newline in MCP header "${name}".`);
    }
    resolved[name] = expanded;
  }
  return resolved;
}

function mcpUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('MCP remote transport requires a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`MCP remote transport does not allow URL protocol: ${url.protocol}`);
  }
  return url;
}

function safeUrlForPrompt(rawUrl) {
  const url = mcpUrl(rawUrl);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function describeMcpServer(serverName, serverDef = {}) {
  const transport = normalizeMcpTransport(serverDef);
  const endpoint = transport === 'stdio'
    ? `command ${serverDef.command || '(missing)'}`
    : safeUrlForPrompt(serverDef.url);
  const configuredTools = Array.isArray(serverDef.tools)
    ? serverDef.tools.map(tool => typeof tool === 'string' ? tool : tool?.name).filter(Boolean)
    : [];
  const tools = configuredTools.length > 0 ? configuredTools.join(', ') : 'discovered after approval';
  return { serverName, transport, endpoint, tools };
}

export function createMcpTransport(serverDef = {}) {
  const transport = normalizeMcpTransport(serverDef);
  if (transport === 'stdio') {
    if (typeof serverDef.command !== 'string' || serverDef.command.trim() === '') {
      throw new Error('STDIO MCP transport requires a command.');
    }
    if (!Array.isArray(serverDef.args || [])) {
      throw new Error('STDIO MCP transport args must be an array.');
    }
    return new StdioClientTransport({
      command: serverDef.command,
      args: serverDef.args || [],
      env: buildMcpEnv(serverDef.env),
    });
  }

  const url = mcpUrl(serverDef.url);
  const headers = resolveMcpHeaders(serverDef.headers);
  const requestInit = { headers };
  if (transport === 'sse') {
    return new SSEClientTransport(url, { eventSourceInit: requestInit, requestInit });
  }
  return new StreamableHTTPClientTransport(url, { requestInit });
}

async function requestMcpConsent(serverName, serverDef) {
  const preview = describeMcpServer(serverName, serverDef);
  if (!process.stdin.isTTY) {
    warn(`MCP server "${serverName}" was not connected: first connection requires interactive approval.`);
    return false;
  }
  const approved = await confirm({
    message: `Connect to MCP server "${preview.serverName}" via ${preview.transport} (${preview.endpoint})? Tools: ${preview.tools}`,
    initialValue: false,
  });
  return approved === true;
}

function removeServerTools(serverName) {
  for (const [name, resolved] of toolMap.entries()) {
    if (resolved.serverName === serverName) toolMap.delete(name);
  }
}

function registerServerTools(serverName, tools) {
  for (const tool of tools) {
    toolMap.set(`${serverName}__${tool.name}`, { serverName, toolName: tool.name });
  }
}

function attachTransportLifecycle(serverName, serverDef, transport) {
  transport.onerror = (err) => {
    warn(`MCP server "${serverName}" transport error: ${sanitizeMcpError(err)}`);
  };
  transport.onclose = () => {
    if (shuttingDown) return;
    const active = activeServers.get(serverName);
    if (!active || active.transport !== transport) return;
    removeServerTools(serverName);
    activeServers.delete(serverName);
    warn(`MCP server "${serverName}" disconnected; retrying up to ${MCP_RECONNECT_DELAYS.length} times.`);
    scheduleReconnect(serverName, serverDef);
  };
}

async function connectMcpServer(serverName, serverDef, { requireConsent = true } = {}) {
  if (requireConsent && !readConsent().has(serverName)) {
    const approved = await (consentOverride || requestMcpConsent)(serverName, serverDef);
    if (!approved) throw new Error('Connection not approved by user.');
  }

  const client = new Client(
    { name: `emile-cli-${serverName}`, version: '1.0.0' },
    { capabilities: {} }
  );
  const transport = createMcpTransport(serverDef);
  attachTransportLifecycle(serverName, serverDef, transport);

  try {
    await client.connect(transport);
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    removeServerTools(serverName);
    activeServers.set(serverName, { client, transport, tools });
    registerServerTools(serverName, tools);
    if (requireConsent) rememberConsent(serverName);
    return tools;
  } catch (err) {
    try { await client.close(); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

function wait(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    reconnectTimers.add(timer);
    setTimeout(() => reconnectTimers.delete(timer), ms);
  });
}

function scheduleReconnect(serverName, serverDef) {
  if (reconnectLocks.has(serverName)) return;
  const reconnect = (async () => {
    for (let attempt = 0; attempt < MCP_RECONNECT_DELAYS.length; attempt += 1) {
      await wait(MCP_RECONNECT_DELAYS[attempt]);
      if (shuttingDown) return;
      try {
        await connectMcpServer(serverName, serverDef, { requireConsent: false });
        warn(`MCP server "${serverName}" reconnected.`);
        return;
      } catch (err) {
        warn(`MCP reconnect ${attempt + 1}/${MCP_RECONNECT_DELAYS.length} for "${serverName}" failed: ${sanitizeMcpError(err)}`);
      }
    }
    warn(`MCP server "${serverName}" is unavailable after ${MCP_RECONNECT_DELAYS.length} reconnect attempts.`);
  })();
  reconnectLocks.set(serverName, reconnect);
  reconnect.finally(() => reconnectLocks.delete(serverName));
}

/**
 * Initialize and connect to all MCP servers defined in the config.
 */
export async function initializeMcp({ confirmConnection = requestMcpConsent } = {}) {
  // Tests and embedders can provide a consent function without replacing the
  // normal interactive prompt. The function is scoped to this initialization.
  consentOverride = confirmConnection === requestMcpConsent ? null : confirmConnection;
  shuttingDown = false;
  const mcpServers = config.mcpConfig.mcpServers || {};
  const serverNames = Object.keys(mcpServers);

  if (serverNames.length === 0) {
    consentOverride = null;
    return { connected: 0, totalTools: 0, details: [] };
  }

  const details = [];

  for (const serverName of serverNames) {
    const serverDef = mcpServers[serverName];
    try {
      const tools = await connectMcpServer(serverName, serverDef);
      details.push({ name: serverName, tools: tools.length, ok: true });
    } catch (err) {
      details.push({ name: serverName, tools: 0, ok: false, error: sanitizeMcpError(err) });
    }
  }

  const connected = details.filter(d => d.ok).length;
  const totalTools = details.reduce((sum, d) => sum + d.tools, 0);
  consentOverride = null;
  return { connected, totalTools, details };
}

/**
 * Close all active MCP connections.
 */
export async function shutdownMcp() {
  shuttingDown = true;
  for (const timer of reconnectTimers) clearTimeout(timer);
  reconnectTimers.clear();
  for (const [serverName, server] of activeServers.entries()) {
    try {
      await server.client.close();
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  activeServers.clear();
  toolMap.clear();
}

/**
 * Compile MCP tools into OpenAI tool formats.
 * Appends server name as prefix to prevent naming conflicts: serverName__toolName.
 * @returns {Array<object>} List of OpenAI format tool definitions
 */
export function getMcpToolDefinitions() {
  const definitions = [];
  for (const [serverName, server] of activeServers.entries()) {
    for (const tool of server.tools) {
      definitions.push({
        type: 'function',
        function: {
          name: `${serverName}__${tool.name}`,
          description: tool.description || `Call ${tool.name} tool from ${serverName} MCP server.`,
          parameters: tool.inputSchema,
        },
      });
    }
  }
  return definitions;
}

/**
 * Executes an MCP tool call by parsing the prefixed name.
 * @param {string} prefixedName e.g., "everything__greet"
 * @param {object} args tool arguments
 * @returns {Promise<string>} Tool response text
 */
export async function handleMcpToolCall(prefixedName, args) {
  const resolved = toolMap.get(prefixedName);
  if (!resolved) {
    throw new Error(`Invalid MCP tool name: ${prefixedName}`);
  }

  const { serverName, toolName } = resolved;

  const server = activeServers.get(serverName);
  if (!server) {
    throw new Error(`MCP Server "${serverName}" is not connected.`);
  }

  try {
    const result = await server.client.callTool({
      name: toolName,
      arguments: args,
    });

    if (!result || !result.content) {
      return 'Tool executed with no output.';
    }

    // Format content response to plain string
    const outputParts = [];
    for (const part of result.content) {
      if (part.type === 'text') {
        outputParts.push(part.text);
      } else if (part.type === 'image') {
        outputParts.push(`[Image output: ${part.data ? 'base64 data' : 'empty'}]`);
      } else {
        outputParts.push(JSON.stringify(part));
      }
    }
    return outputParts.join('\n');
  } catch (err) {
    return `Error calling MCP tool ${toolName} on ${serverName}: ${err.message}`;
  }
}

/**
 * Checks if a tool name is an MCP tool.
 * @param {string} name 
 * @returns {boolean}
 */
export function isMcpTool(name) {
  return toolMap.has(name);
}
