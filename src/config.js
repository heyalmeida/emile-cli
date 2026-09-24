import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { warn, error as logError } from './ui/log.js';

// Load environment variables from .env as fallback.
dotenv.config();

const workspaceDir = process.cwd();
const emileDir = path.join(workspaceDir, '.emile');
const workspaceConfigPath = path.join(emileDir, 'config.json');

function resolveUserConfigDir() {
  const override = process.env.EMILE_CONFIG_DIR;
  if (override) return path.resolve(override);

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'emile');
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'emile');
}

const userConfigDir = resolveUserConfigDir();
const userConfigPath = path.join(userConfigDir, 'config.json');
const credentialsPath = path.join(userConfigDir, 'credentials.json');
const credentialsKeyPath = path.join(userConfigDir, 'credentials.key');

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch { /* best effort on Windows/FAT */ }
}

function writePrivateJson(filePath, value) {
  ensurePrivateDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort on Windows/FAT */ }
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    warn(`Failed to read ${label}: ${err.message}`);
    return null;
  }
}

// Find and load mcp.json if it exists.
function loadMcpConfig() {
  const mcpPath = path.join(workspaceDir, 'mcp.json');
  if (fs.existsSync(mcpPath)) {
    try {
      const content = fs.readFileSync(mcpPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      warn(`Failed to parse mcp.json: ${err.message}`);
    }
  }
  return { mcpServers: {} };
}

const DPAPI_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Security',
  '$plain = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())',
  '$protected = [System.Security.Cryptography.ProtectedData]::Protect($plain, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Convert]::ToBase64String($protected))',
].join('; ');

const DPAPI_UNPROTECT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Security',
  '$encoded = [Console]::In.ReadToEnd()',
  '$cipher = [Convert]::FromBase64String($encoded)',
  '$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Convert]::ToBase64String($plain))',
].join('; ');

function runDpapi(script, input) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Windows credential protection is unavailable.');
  }
  return String(result.stdout || '').trim();
}

function protectCredential(value) {
  if (process.platform === 'win32') {
    return { storage: 'dpapi', value: runDpapi(DPAPI_SCRIPT, value) };
  }

  const key = getFallbackEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    storage: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    value: encrypted.toString('base64'),
  };
}

function unprotectCredential(entry) {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.storage === 'dpapi') {
    if (process.platform !== 'win32') return '';
    const decoded = runDpapi(DPAPI_UNPROTECT_SCRIPT, String(entry.value || ''));
    return decoded ? Buffer.from(decoded, 'base64').toString('utf8') : '';
  }
  if (entry.storage !== 'aes-256-gcm' || process.platform === 'win32') return '';

  const key = getFallbackEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv || '', 'base64'));
  decipher.setAuthTag(Buffer.from(entry.tag || '', 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(entry.value || '', 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function getFallbackEncryptionKey() {
  ensurePrivateDirectory(userConfigDir);
  if (!fs.existsSync(credentialsKeyPath)) {
    fs.writeFileSync(credentialsKeyPath, randomBytes(32), { mode: 0o600 });
  }
  try { fs.chmodSync(credentialsKeyPath, 0o600); } catch { /* best effort on Windows/FAT */ }
  const key = fs.readFileSync(credentialsKeyPath);
  if (key.length !== 32) throw new Error('Credential key file is invalid.');
  return key;
}

function loadCredentialStore() {
  const store = readJsonFile(credentialsPath, 'protected credentials');
  if (!store) return { version: 1, entries: {} };
  if (store.version !== 1 || !store.entries || typeof store.entries !== 'object' || Array.isArray(store.entries)) {
    warn('Protected credential store is invalid; credentials will be requested again.');
    return { version: 1, entries: {} };
  }
  return store;
}

function storeCredential(provider, value) {
  if (!provider || typeof value !== 'string' || value.length === 0) {
    throw new Error('A provider and credential are required.');
  }
  const store = loadCredentialStore();
  store.entries[provider] = protectCredential(value);
  writePrivateJson(credentialsPath, store);
}

function getStoredCredential(provider) {
  try {
    const entry = loadCredentialStore().entries?.[provider];
    return unprotectCredential(entry);
  } catch (err) {
    warn(`Could not read the protected credential for ${String(provider || 'the selected provider')}: ${err.message}`);
    return '';
  }
}

export function saveProtectedCredential(name, value) {
  if (!name || typeof name !== 'string') throw new Error('A protected credential name is required.');
  storeCredential(`protected:${name}`, value);
}

export function resolveProtectedCredential(name) {
  if (!name || typeof name !== 'string') return '';
  return getStoredCredential(`protected:${name}`);
}

function writeUserConfig(data) {
  try {
    writePrivateJson(userConfigPath, data);
    return true;
  } catch (err) {
    logError(`Error saving user configuration: ${err.message}`);
    return false;
  }
}

function migrateLegacyConfig(raw, sourcePath) {
  if (!raw || typeof raw.apiKey !== 'string' || raw.apiKey.length === 0) return raw;

  const provider = raw.provider || process.env.EMILE_PROVIDER || 'requesty';
  try {
    storeCredential(provider, raw.apiKey);
    const sanitized = { ...raw };
    delete sanitized.apiKey;
    const saved = writeUserConfig(sanitized);
    if (!saved) throw new Error('Could not save the migrated user configuration.');
    if (sourcePath !== userConfigPath) writePrivateJson(sourcePath, sanitized);
    return sanitized;
  } catch (err) {
    // Never delete the only usable credential if protected storage failed.
    warn(`Could not migrate the legacy API key securely: ${err.message}`);
    const sanitized = { ...raw };
    delete sanitized.apiKey;
    return sanitized;
  }
}

function loadUserConfig() {
  const globalConfig = readJsonFile(userConfigPath, 'user configuration');
  if (globalConfig) return migrateLegacyConfig(globalConfig, userConfigPath);
  const legacyConfig = readJsonFile(workspaceConfigPath, 'legacy workspace configuration');
  return migrateLegacyConfig(legacyConfig, workspaceConfigPath) || {};
}

const savedConfig = loadUserConfig() || {};

function readBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const webSearch = readBoolean(
  savedConfig.webSearch ?? process.env.EMILE_WEB_SEARCH,
  false,
);

// ── API key resolution ────────────────────────────────────────────────────────

const ENV_KEY_MAP = {
  requesty: 'REQUESTY_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  'opencode-go': 'OPENCODE_API_KEY',
};

/**
 * Returns the API key for the given provider from protected storage or its
 * matching environment variable. It never reads credentials from settings JSON
 * and never falls back to another provider's key.
 */
export function resolveApiKey(provider) {
  const stored = getStoredCredential(provider);
  if (stored) return stored;
  const envVar = ENV_KEY_MAP[provider];
  if (envVar && typeof process.env[envVar] === 'string' && process.env[envVar].length > 0) {
    return process.env[envVar];
  }
  return '';
}

const initialProvider = savedConfig.provider || process.env.EMILE_PROVIDER || 'requesty';

export const config = {
  provider: initialProvider,
  apiKey: resolveApiKey(initialProvider),
  defaultModel: savedConfig.model || process.env.EMILE_DEFAULT_MODEL || 'anthropic/claude-3-5-sonnet',
  defaultEffort: savedConfig.effort || process.env.EMILE_DEFAULT_EFFORT || 'low',
  workspaceDir,
  mcpConfig: loadMcpConfig(),
  webSearch,
  sessionCwd: workspaceDir,
  dryRun: false,
  safeMode: true,
  commandTimeout: 30000,
  maxSessionSize: Number(process.env.EMILE_MAX_SESSION_SIZE) > 0
    ? Number(process.env.EMILE_MAX_SESSION_SIZE)
    : 10 * 1024 * 1024,
  expandThinking: true,
  maxLoopIterations: readPositiveInt(
    savedConfig.maxLoopIterations ?? process.env.EMILE_MAX_LOOP_ITERATIONS,
    40,
  ),
};

export function getUserConfigPath() {
  return userConfigPath;
}

export function getCredentialsPath() {
  return credentialsPath;
}

/**
 * Saves user settings persistently without serializing the API key. A supplied
 * key is written only to protected credential storage.
 */
export function saveUserConfig(settings = {}) {
  if (settings.provider) config.provider = settings.provider;
  if (settings.apiKey) {
    config.apiKey = settings.apiKey;
    try {
      storeCredential(config.provider, settings.apiKey);
    } catch (err) {
      logError(`Could not protect the API key: ${err.message}`);
      return false;
    }
  } else if (settings.provider) {
    config.apiKey = resolveApiKey(config.provider);
  }
  if (settings.model) config.defaultModel = settings.model;
  if ('effort' in settings) config.defaultEffort = settings.effort;
  if ('webSearch' in settings) config.webSearch = settings.webSearch === true;
  if ('maxLoopIterations' in settings) {
    config.maxLoopIterations = readPositiveInt(settings.maxLoopIterations, config.maxLoopIterations);
  }

  return writeUserConfig({
    schemaVersion: 2,
    provider: config.provider,
    model: config.defaultModel,
    effort: config.defaultEffort,
    webSearch: config.webSearch,
    maxLoopIterations: config.maxLoopIterations,
  });
}

export function hasCredentials() {
  return !!config.apiKey;
}

export function validateConfig() {
  return hasCredentials();
}
