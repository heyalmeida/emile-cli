import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Load environment variables from .env as fallback
dotenv.config();

const workspaceDir = process.cwd();
const emileDir = path.join(workspaceDir, '.emile');
const userConfigPath = path.join(emileDir, 'config.json');

// Find and load mcp.json if it exists
function loadMcpConfig() {
  const mcpPath = path.join(workspaceDir, 'mcp.json');
  if (fs.existsSync(mcpPath)) {
    try {
      const content = fs.readFileSync(mcpPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn(`[Warning] Failed to parse mcp.json: ${err.message}`);
    }
  }
  return { mcpServers: {} };
}

// Load persistent config.json if it exists
function loadUserConfig() {
  if (fs.existsSync(userConfigPath)) {
    try {
      const content = fs.readFileSync(userConfigPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn(`[Warning] Failed to parse .emile/config.json: ${err.message}`);
    }
  }
  return null;
}

const savedConfig = loadUserConfig() || {};

export const config = {
  provider: savedConfig.provider || process.env.EMILE_PROVIDER || 'requesty',
  apiKey: savedConfig.apiKey || process.env.REQUESTY_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENCODE_API_KEY || '',
  defaultModel: savedConfig.model || process.env.EMILE_DEFAULT_MODEL || 'anthropic/claude-3-5-sonnet',
  defaultEffort: savedConfig.effort || process.env.EMILE_DEFAULT_EFFORT || 'low',
  workspaceDir,
  mcpConfig: loadMcpConfig(),
  dryRun: false,
  safeMode: true,
  commandTimeout: 30000,
};

/**
 * Saves user settings persistently to .emile/config.json.
 * @param {object} settings 
 * @param {string} [settings.provider] 
 * @param {string} [settings.apiKey] 
 * @param {string} [settings.model] 
 * @param {string} [settings.effort] 
 */
export function saveUserConfig(settings) {
  if (!fs.existsSync(emileDir)) {
    fs.mkdirSync(emileDir, { recursive: true });
  }

  // Update in-memory configuration
  if (settings.provider) config.provider = settings.provider;
  if (settings.apiKey) config.apiKey = settings.apiKey;
  if (settings.model) config.defaultModel = settings.model;
  if ('effort' in settings) config.defaultEffort = settings.effort;

  const dataToSave = {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.defaultModel,
    effort: config.defaultEffort,
  };

  try {
    fs.writeFileSync(userConfigPath, JSON.stringify(dataToSave, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error saving config.json: ${err.message}`);
  }
}

/**
 * Checks if configuration is complete. Returns false if credentials are missing.
 * @returns {boolean}
 */
export function hasCredentials() {
  return !!config.apiKey;
}

export function validateConfig() {
  // If we don't have credentials, we return false and let the CLI handle starting the connect wizard
  return hasCredentials();
}
