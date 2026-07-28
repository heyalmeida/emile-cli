import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config } from './config.js';

// Map of serverName -> { client, transport, tools: [] }
const activeServers = new Map();

/**
 * Initialize and connect to all MCP servers defined in the config.
 */
export async function initializeMcp() {
  const mcpServers = config.mcpConfig.mcpServers || {};
  const serverNames = Object.keys(mcpServers);

  if (serverNames.length === 0) {
    return;
  }

  console.log(`[MCP] Connecting to ${serverNames.length} MCP server(s)...`);

  for (const serverName of serverNames) {
    const serverDef = mcpServers[serverName];
    try {
      const client = new Client(
        { name: `emile-cli-${serverName}`, version: '1.0.0' },
        { capabilities: {} }
      );

      const transport = new StdioClientTransport({
        command: serverDef.command,
        args: serverDef.args || [],
        env: {
          ...process.env,
          ...(serverDef.env || {}),
        },
      });

      await client.connect(transport);
      
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools || [];
      
      activeServers.set(serverName, { client, transport, tools });
      console.log(`[MCP] Connected to "${serverName}" successfully (${tools.length} tools).`);
    } catch (err) {
      console.error(`[MCP Error] Failed to connect to server "${serverName}": ${err.message}`);
    }
  }
}

/**
 * Close all active MCP connections.
 */
export async function shutdownMcp() {
  for (const [serverName, server] of activeServers.entries()) {
    try {
      await server.client.close();
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  activeServers.clear();
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
  const delimiterIndex = prefixedName.indexOf('__');
  if (delimiterIndex === -1) {
    throw new Error(`Invalid MCP tool name: ${prefixedName}`);
  }

  const serverName = prefixedName.substring(0, delimiterIndex);
  const toolName = prefixedName.substring(delimiterIndex + 2);

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
  const delimiterIndex = name.indexOf('__');
  if (delimiterIndex === -1) return false;
  const serverName = name.substring(0, delimiterIndex);
  return activeServers.has(serverName);
}
