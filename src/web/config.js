// config.js — isolated persistence for enhanced-web settings and credentials.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const WEB_CONFIG_KEYS = new Set([
  'webSearchMode',
  'tavilyApiKey',
  'tavilyEnabled',
  'firecrawlApiKey',
  'firecrawlEnabled',
]);

function readBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

function webConfigPath(runtimeConfig = config) {
  return path.join(runtimeConfig.workspaceDir, '.emile', 'web.json');
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

export function hydrateEnhancedWebConfig(runtimeConfig = config, {
  saved = loadWebConfig(runtimeConfig),
  env = process.env,
} = {}) {
  runtimeConfig.webSearchMode = saved.webSearchMode === 'enhanced' ? 'enhanced' : 'native';
  runtimeConfig.tavilyApiKey = saved.tavilyApiKey || env.TAVILY_API_KEY || '';
  runtimeConfig.tavilyEnabled = readBoolean(saved.tavilyEnabled ?? env.EMILE_TAVILY_ENABLED, false);
  runtimeConfig.firecrawlApiKey = saved.firecrawlApiKey || env.FIRECRAWL_API_KEY || '';
  runtimeConfig.firecrawlEnabled = readBoolean(saved.firecrawlEnabled ?? env.EMILE_FIRECRAWL_ENABLED, false);
  return runtimeConfig;
}

export function saveEnhancedWebConfig(settings, {
  runtimeConfig = config,
  filePath = webConfigPath(runtimeConfig),
} = {}) {
  const persisted = loadWebConfig(runtimeConfig);
  for (const [key, value] of Object.entries(settings || {})) {
    if (!WEB_CONFIG_KEYS.has(key)) continue;
    if (key.endsWith('ApiKey')) {
      if (typeof value === 'string' && value.trim()) runtimeConfig[key] = value.trim();
      continue;
    }
    if (key.endsWith('Enabled')) {
      runtimeConfig[key] = value === true;
      continue;
    }
    if (key === 'webSearchMode' && (value === 'native' || value === 'enhanced')) {
      runtimeConfig[key] = value;
    }
  }

  const next = {
    ...persisted,
    webSearchMode: runtimeConfig.webSearchMode === 'enhanced' ? 'enhanced' : 'native',
    tavilyApiKey: runtimeConfig.tavilyApiKey || '',
    tavilyEnabled: runtimeConfig.tavilyEnabled === true,
    firecrawlApiKey: runtimeConfig.firecrawlApiKey || '',
    firecrawlEnabled: runtimeConfig.firecrawlEnabled === true,
  };
  delete next.webSearch;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch { /* best-effort on non-POSIX filesystems */ }
  return runtimeConfig;
}

hydrateEnhancedWebConfig(config);
