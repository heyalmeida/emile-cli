// config.js — isolated persistence for enhanced-web settings and credentials.
import fs from 'node:fs';
import path from 'node:path';
import { config, resolveProtectedCredential, saveProtectedCredential } from '../config.js';
import { warn } from '../ui/log.js';

const WEB_CONFIG_KEYS = new Set([
  'webSearchMode',
  'tavilyApiKey',
  'tavilyEnabled',
  'firecrawlApiKey',
  'firecrawlEnabled',
]);

const DEFAULT_PROTECTED_STORE = {
  save: saveProtectedCredential,
  resolve: resolveProtectedCredential,
};

function readBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

function webConfigPath(runtimeConfig = config) {
  return path.join(runtimeConfig.workspaceDir || process.cwd(), '.emile', 'web.json');
}

function loadWebConfig(runtimeConfig = config) {
  try {
    const filePath = webConfigPath(runtimeConfig);
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeWebConfig(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch { /* best-effort on Windows/FAT */ }
}

function readProtected(provider, protectedStore) {
  try {
    return protectedStore.resolve(`web:${provider}`) || '';
  } catch (err) {
    warn(`Could not read the protected ${provider} web credential: ${err.message}`);
    return '';
  }
}

function migrateLegacyCredentials(saved, {
  filePath,
  protectedStore,
}) {
  const next = { ...saved };
  const migrated = {};
  const failed = new Set();
  let changed = false;

  for (const provider of ['tavily', 'firecrawl']) {
    const keyName = `${provider}ApiKey`;
    const legacyKey = next[keyName];
    if (typeof legacyKey !== 'string' || legacyKey.length === 0) continue;
    try {
      protectedStore.save(`web:${provider}`, legacyKey);
      migrated[provider] = legacyKey;
      delete next[keyName];
      changed = true;
    } catch (err) {
      // Keep the legacy file untouched; never claim a secure migration succeeded.
      failed.add(provider);
      warn(`Could not migrate the ${provider} web credential securely: ${err.message}`);
    }
  }

  if (changed) {
    try {
      writeWebConfig(filePath, next);
    } catch (err) {
      warn(`Could not rewrite enhanced web settings without legacy credentials: ${err.message}`);
    }
  }
  return { next, migrated, failed };
}

export function hydrateEnhancedWebConfig(runtimeConfig = config, {
  saved,
  env = process.env,
  filePath = webConfigPath(runtimeConfig),
  protectedStore = DEFAULT_PROTECTED_STORE,
} = {}) {
  const source = saved === undefined ? loadWebConfig(runtimeConfig) : (saved || {});
  const migration = migrateLegacyCredentials(source, { filePath, protectedStore });
  const persisted = migration.next;

  runtimeConfig.webSearchMode = persisted.webSearchMode === 'enhanced' ? 'enhanced' : 'native';
  runtimeConfig.tavilyApiKey = readProtected('tavily', protectedStore) ||
    migration.migrated.tavily || (migration.failed.has('tavily') ? '' : persisted.tavilyApiKey) || env.TAVILY_API_KEY || '';
  runtimeConfig.tavilyEnabled = readBoolean(persisted.tavilyEnabled ?? env.EMILE_TAVILY_ENABLED, false);
  runtimeConfig.firecrawlApiKey = readProtected('firecrawl', protectedStore) ||
    migration.migrated.firecrawl || (migration.failed.has('firecrawl') ? '' : persisted.firecrawlApiKey) || env.FIRECRAWL_API_KEY || '';
  runtimeConfig.firecrawlEnabled = readBoolean(persisted.firecrawlEnabled ?? env.EMILE_FIRECRAWL_ENABLED, false);
  return runtimeConfig;
}

export function saveEnhancedWebConfig(settings, {
  runtimeConfig = config,
  filePath = webConfigPath(runtimeConfig),
  protectedStore = DEFAULT_PROTECTED_STORE,
} = {}) {
  const persisted = loadWebConfig(runtimeConfig);
  const next = { ...persisted };

  for (const [key, value] of Object.entries(settings || {})) {
    if (!WEB_CONFIG_KEYS.has(key)) continue;
    if (key.endsWith('ApiKey')) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const provider = key.slice(0, -'ApiKey'.length);
      protectedStore.save(`web:${provider}`, value.trim());
      runtimeConfig[key] = value.trim();
      delete next[key];
      continue;
    }
    if (key.endsWith('Enabled')) {
      runtimeConfig[key] = value === true;
      next[key] = value === true;
      continue;
    }
    if (key === 'webSearchMode' && (value === 'native' || value === 'enhanced')) {
      runtimeConfig[key] = value;
      next[key] = value;
    }
  }

  next.webSearchMode = runtimeConfig.webSearchMode === 'enhanced' ? 'enhanced' : 'native';
  next.tavilyEnabled = runtimeConfig.tavilyEnabled === true;
  next.firecrawlEnabled = runtimeConfig.firecrawlEnabled === true;
  delete next.tavilyApiKey;
  delete next.firecrawlApiKey;
  delete next.webSearch;

  writeWebConfig(filePath, next);
  return runtimeConfig;
}

hydrateEnhancedWebConfig(config);
