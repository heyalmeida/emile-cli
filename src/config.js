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
const projectEmileDir = path.join(workspaceDir, '.emile');
// Global config lives in ~/.emile/ so credentials persist across projects
const globalEmileDir = path.join(os.homedir(), '.emile');
const userConfigPath = path.join(globalEmileDir, 'config.json');

const DEFAULT_MODEL = 'anthropic/claude-3-5-sonnet';

// Gateways with a built-in OpenAI-compatible transport. Anything else is a
// user-defined (custom) provider slot that must carry its own endpoint.
const RESERVED_PROVIDER_IDS = ['requesty', 'openrouter', 'opencode', 'opencode-go'];

const RESERVED_ID_SET = new Set(RESERVED_PROVIDER_IDS);

const API_FORMATS = ['anthropic-messages', 'chat-completions', 'responses'];

// Request-body key used to carry the reasoning effort. '' keeps the model-catalog
// auto path; only consulted for a custom slot using the chat-completions format.
export const REASONING_STYLES = ['', 'none', 'reasoning_effort', 'reasoning', 'thinking', 'enable_thinking', 'chat_template_kwargs', 'effort', 'reasoningEffort', 'both'];

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

// Load persistent config.json if it exists
function loadUserConfig() {
  if (fs.existsSync(userConfigPath)) {
    try {
      const content = fs.readFileSync(userConfigPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      warn(`Failed to parse ~/.emile/config.json: ${err.message}`);
    }
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

function readBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

// Single source of truth for the agentic loop cap (spec 2026-10-08-maxloop-divergence).
export const DEFAULT_MAX_LOOP_ITERATIONS = 90;

export function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

// ── Provider helpers ──────────────────────────────────────────────────────────

/** True when `id` is a user-defined (non-gateway) provider id. */
export function isCustomProvider(id) {
  return typeof id === 'string' && id.length > 0 && !RESERVED_ID_SET.has(id);
}

/**
 * Endpoint validation for custom providers: https anywhere, plain http only
 * on the loopback interface, everything else (file:, data:, ws:, garbage)
 * rejected.
 */
export function isValidProviderURL(urlString) {
  let parsed;
  try {
    parsed = new URL(String(urlString));
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  }
  return false;
}

function cleanSlot(id, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const slot = {};
  if (typeof raw.apiKey === 'string') slot.apiKey = raw.apiKey;
  if (typeof raw.lastModel === 'string' && raw.lastModel.length > 0) slot.lastModel = raw.lastModel;
  if (typeof raw.baseURL === 'string' && raw.baseURL.length > 0) slot.baseURL = raw.baseURL;
  if (typeof raw.format === 'string' && API_FORMATS.includes(raw.format)) slot.format = raw.format;
  if (typeof raw.label === 'string' && raw.label.length > 0) slot.label = raw.label;
  // Membership, not truthiness: '' is a valid explicit value (model-catalog auto).
  // Gateways are dropped too: a reserved gateway id has no reasoningStyle field.
  if (isCustomProvider(id) && typeof raw.reasoningStyle === 'string' && REASONING_STYLES.includes(raw.reasoningStyle)) slot.reasoningStyle = raw.reasoningStyle;

  // Gateways are addressable even without a stored key (env fallback).
  if (!isCustomProvider(id)) return slot;
  // A custom endpoint without a baseURL is unusable — drop it silently.
  if (!slot.baseURL) return null;
  return slot;
}

function readProviders(raw) {
  const providers = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return providers;
  for (const [id, value] of Object.entries(raw)) {
    const slot = cleanSlot(id, value);
    if (slot) providers[id] = slot;
  }
  return providers;
}

// ── Config state ──────────────────────────────────────────────────────────────

const savedConfig = loadUserConfig() || {};

const savedIsV2 = typeof savedConfig.version === 'number';

let providers = {};
let savedActive = typeof savedConfig.activeProvider === 'string' ? savedConfig.activeProvider : null;
if (savedIsV2) {
  providers = readProviders(savedConfig.providers);
} else if (typeof savedConfig.provider === 'string' && RESERVED_ID_SET.has(savedConfig.provider)) {
  // Legacy v1 flat shape: a single reserved gateway slot, which also stays
  // the active provider after migration.
  const legacySlot = {};
  legacySlot.apiKey = typeof savedConfig.apiKey === 'string' ? savedConfig.apiKey : '';
  if (typeof savedConfig.model === 'string') legacySlot.lastModel = savedConfig.model;
  providers[savedConfig.provider] = legacySlot;
  savedActive = savedConfig.provider;
}
// A v1 provider that is not a reserved gateway (no endpoint to talk to) is
// malformed: its provider/apiKey/model fields are ignored entirely.

const state = {
  version: 2,
  activeProvider: savedActive,
  providers,
  effort: savedConfig.effort,
  webSearch: savedConfig.webSearch,
  maxLoopIterations: savedConfig.maxLoopIterations,
};

// ── API key resolution ────────────────────────────────────────────────────────

const ENV_KEY_MAP = {
  requesty: 'REQUESTY_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  'opencode-go': 'OPENCODE_API_KEY',
};

/**
 * Returns the API key for the given provider.
 * Only the provider's own stored slot is consulted; otherwise the
 * provider-specific env var. There is no cross-provider fallback.
 *
 * @param {string} provider
 * @returns {string}
 */
export function resolveApiKey(provider) {
  const slot = state.providers[provider];
  if (slot && typeof slot.apiKey === 'string' && slot.apiKey.length > 0) {
    return slot.apiKey;
  }
  const envVar = ENV_KEY_MAP[provider];
  if (envVar && typeof process.env[envVar] === 'string' && process.env[envVar].length > 0) {
    return process.env[envVar];
  }
  return '';
}

const webSearch = readBoolean(
  state.webSearch ?? process.env.EMILE_WEB_SEARCH,
  false,
);

function resolveActiveProvider() {
  const saved = state.activeProvider;
  if (saved && (RESERVED_ID_SET.has(saved) || state.providers[saved])) return saved;
  const envProvider = process.env.EMILE_PROVIDER;
  if (typeof envProvider === 'string' && RESERVED_ID_SET.has(envProvider)) return envProvider;
  return 'requesty';
}

const activeProvider = resolveActiveProvider();
// Keep the mutable state aligned with the boot decision so later saves
// (saveUserConfig / setActiveProvider / removeProvider) target the same slot.
state.activeProvider = activeProvider;

export const config = {
  provider: activeProvider,
  apiKey: resolveApiKey(activeProvider),
  defaultModel: state.providers[activeProvider]?.lastModel
    || process.env.EMILE_DEFAULT_MODEL
    || DEFAULT_MODEL,
  defaultEffort: state.effort || process.env.EMILE_DEFAULT_EFFORT || 'low',
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
    state.maxLoopIterations ?? process.env.EMILE_MAX_LOOP_ITERATIONS,
    DEFAULT_MAX_LOOP_ITERATIONS,
  ),
};

// ── Provider slot introspection ───────────────────────────────────────────────

function slotView(id) {
  const slot = state.providers[id];
  const apiKey = typeof slot?.apiKey === 'string' ? slot.apiKey : '';
  return {
    id,
    label: slot?.label || undefined,
    isCustom: isCustomProvider(id),
    // Gateways always speak the OpenAI-compatible chat-completions shape.
    format: isCustomProvider(id) ? (slot?.format || 'chat-completions') : 'chat-completions',
    // Inert for gateways: the reasoning parameter is fixed by their transport.
    reasoningStyle: isCustomProvider(id) ? (slot?.reasoningStyle || '') : '',
    baseURL: slot?.baseURL || undefined,
    lastModel: slot?.lastModel || undefined,
    hasKey: apiKey.length > 0,
    keyTail: apiKey.slice(-4),
  };
}

function blankDef(id) {
  return {
    id,
    label: undefined,
    isCustom: false,
    format: 'chat-completions',
    reasoningStyle: '',
    baseURL: undefined,
    lastModel: undefined,
    hasKey: false,
    keyTail: '',
    apiKey: '',
  };
}

/** Surviving provider slots, in insertion order. Never exposes full keys. */
export function getProviderSlots() {
  return Object.keys(state.providers).map(slotView);
}

/** Definition of the active provider, including its raw stored key. */
export function getActiveProviderDef() {
  const id = config.provider;
  if (!state.providers[id]) return blankDef(id);
  return { ...slotView(id), apiKey: state.providers[id].apiKey || '' };
}

function refreshViews() {
  config.provider = state.activeProvider;
  config.apiKey = resolveApiKey(state.activeProvider);
  config.defaultModel = state.providers[state.activeProvider]?.lastModel
    || process.env.EMILE_DEFAULT_MODEL
    || DEFAULT_MODEL;
}

function writeState() {
  if (!fs.existsSync(globalEmileDir)) {
    fs.mkdirSync(globalEmileDir, { recursive: true });
  }

  const dataToSave = {
    version: 2,
    activeProvider: state.activeProvider,
    providers: state.providers,
    effort: config.defaultEffort,
    webSearch: config.webSearch,
    maxLoopIterations: config.maxLoopIterations,
  });
}

/**
 * Switches the active provider to a gateway id or a surviving custom slot.
 * Invalid ids are rejected without touching any state.
 * @param {string} id
 * @returns {boolean}
 */
export function setActiveProvider(id) {
  if (typeof id !== 'string' || id.length === 0) return false;
  if (!RESERVED_ID_SET.has(id) && !state.providers[id]) return false;
  state.activeProvider = id;
  refreshViews();
  writeState();
  return true;
}

/**
 * Deletes a custom slot. Gateway ids without a stored slot are a no-op.
 * When the removed slot was active, falls back to the first remaining slot.
 * @param {string} id
 * @returns {boolean}
 */
export function removeProvider(id) {
  if (RESERVED_ID_SET.has(id) && !state.providers[id]) return true;
  if (!Object.prototype.hasOwnProperty.call(state.providers, id)) return true;
  delete state.providers[id];
  if (state.activeProvider === id) {
    state.activeProvider = Object.keys(state.providers)[0] || 'requesty';
  }
  refreshViews();
  writeState();
  return true;
}

/**
 * Saves user settings persistently to ~/.emile/config.json (global).
 * The file is always written in the v2 multi-slot shape.
 *
 * @param {object} settings
 * @param {string} [settings.provider]  Target slot id; also becomes active.
 * @param {string} [settings.apiKey]    Stored even when empty (keyless localhost).
 * @param {string} [settings.model]     Stored as the slot's lastModel.
 * @param {string} [settings.baseURL]   Custom endpoint (ignored for gateways).
 * @param {string} [settings.format]    One of the three API formats (custom only).
 * @param {string} [settings.reasoningStyle] One of REASONING_STYLES (custom only).
 * @param {string} [settings.label]     Human-readable slot label.
 * @param {string} [settings.effort]
 * @param {boolean} [settings.webSearch]
 * @param {number} [settings.maxLoopIterations]
 */
export function saveUserConfig(settings) {
  const target = typeof settings.provider === 'string' && settings.provider.length > 0
    ? settings.provider
    : state.activeProvider;

  if (settings.provider) state.activeProvider = settings.provider;

  // Only materialise the target slot when there is something to store, so
  // saving an unrelated setting never litters the file with empty slots.
  const slotWritesKey = 'apiKey' in settings;
  const slotWritesFormat = isCustomProvider(target) && API_FORMATS.includes(settings.format);
  const slotWritesReasoningStyle = isCustomProvider(target)
    && typeof settings.reasoningStyle === 'string'
    && REASONING_STYLES.includes(settings.reasoningStyle);
  if (slotWritesKey || slotWritesFormat || settings.model || settings.baseURL || settings.label || slotWritesReasoningStyle) {
    if (!state.providers[target]) state.providers[target] = {};
    const slot = state.providers[target];

    // Presence, not truthiness: an empty key is a valid "no auth" endpoint.
    if (slotWritesKey) slot.apiKey = String(settings.apiKey || '');
    if (settings.model) slot.lastModel = settings.model;
    if (settings.baseURL) slot.baseURL = settings.baseURL;
    if (settings.label) slot.label = settings.label;
    // Reserved gateways always speak chat-completions; never persist a format for them.
    if (slotWritesFormat) slot.format = settings.format;
    if (slotWritesReasoningStyle) slot.reasoningStyle = settings.reasoningStyle;
  }

  if ('effort' in settings) config.defaultEffort = settings.effort;
  if ('webSearch' in settings) config.webSearch = settings.webSearch === true;
  if ('maxLoopIterations' in settings) {
    config.maxLoopIterations = readPositiveInt(settings.maxLoopIterations, config.maxLoopIterations);
  }

  if (settings.model) config.defaultModel = settings.model;

  writeState();
  config.provider = state.activeProvider;
  config.apiKey = resolveApiKey(config.provider);
}

/**
 * Checks if configuration is complete. A custom endpoint with a valid URL is
 * bootable without a key (e.g. keyless localhost servers).
 * @returns {boolean}
 */
export function hasCredentials() {
  if (config.apiKey) return true;
  const def = getActiveProviderDef();
  return Boolean(def.isCustom && isValidProviderURL(def.baseURL));
}

export function validateConfig() {
  return hasCredentials();
}
