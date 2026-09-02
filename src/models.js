/**
 * models.js — single source of truth for model metadata.
 *
 * One table answers: context window, pricing (USD per 1M tokens) and
 * reasoning capability. agent.js (cost/context), api.js (effort gating)
 * and any future UI consult getModelInfo() instead of scattering
 * conditionals that go stale.
 *
 * NOTE: prices/windows are best-effort metadata for cost estimates and
 * quota display — update this table when vendors change them. First
 * matching entry wins, so put more specific patterns first.
 */

export const MODEL_INFO = [
  // Free routes — zero cost regardless of the underlying model
  { match: /openrouter\/free|:free/,        context: 128000,   inputPrice: 0,    outputPrice: 0,    reasoning: false },

  // Anthropic
  { match: /claude-.*opus|opus/,            context: 200000,   inputPrice: 15,   outputPrice: 75,   reasoning: true },
  { match: /claude/,                        context: 200000,   inputPrice: 3,    outputPrice: 15,   reasoning: true },

  // Google — Gemini 2.5 family has a 1M-token window and thinking mode
  { match: /gemini-2\.5-pro/,               context: 1048576,  inputPrice: 1.25, outputPrice: 10,   reasoning: true },
  { match: /gemini-2\.5-flash/,             context: 1048576,  inputPrice: 0.3,  outputPrice: 2.5,  reasoning: true },
  { match: /gemini/,                        context: 1000000,  inputPrice: 1.25, outputPrice: 10,   reasoning: false },

  // OpenAI
  { match: /gpt-4\.1/,                      context: 1047576,  inputPrice: 2,    outputPrice: 8,    reasoning: false },
  { match: /o[134](-mini)?(-high|-medium|-low)?/, context: 200000, inputPrice: 2, outputPrice: 8,    reasoning: true },
  { match: /gpt-4o|gpt-4-turbo/,            context: 128000,   inputPrice: 2.5,  outputPrice: 10,   reasoning: false },

  // DeepSeek
  { match: /deepseek-reasoner|r1/,          context: 131072,   inputPrice: 0.55, outputPrice: 2.19, reasoning: true },
  { match: /deepseek/,                      context: 131072,   inputPrice: 0.27, outputPrice: 1.1,  reasoning: false },

  // Other labs (best-effort)
  { match: /kimi/,                          context: 131072,   inputPrice: 0.6,  outputPrice: 2.5,  reasoning: false },
  { match: /grok/,                          context: 131072,   inputPrice: 3,    outputPrice: 15,   reasoning: false },
  { match: /minimax/,                       context: 1000000,  inputPrice: 0.4,  outputPrice: 2.1,  reasoning: false },
  { match: /qwen/,                          context: 131072,   inputPrice: 0.4,  outputPrice: 1.2,  reasoning: false },
  { match: /glm/,                           context: 131072,   inputPrice: 0.6,  outputPrice: 2.2,  reasoning: false },
  { match: /llama-?3/,                      context: 131072,   inputPrice: 0.1,  outputPrice: 0.3,  reasoning: false },
];

// Safe fallback for unknown/custom models
export const DEFAULT_MODEL_INFO = {
  context: 128000,
  inputPrice: 3,
  outputPrice: 15,
  reasoning: false,
};

/**
 * Returns the metadata entry for a model id (provider-prefixed or bare).
 * @param {string} model e.g. 'anthropic/claude-sonnet-4-5' or 'deepseek-v4-pro'
 * @returns {{ context:number, inputPrice:number, outputPrice:number, reasoning:boolean }}
 */
export function getModelInfo(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return { ...DEFAULT_MODEL_INFO };

  // 1+2. Dynamic catalog (OpenRouter live data)
  if (_dynamicCatalog) {
    const exact = _dynamicCatalog.byExact.get(m);
    if (exact) return { ...exact };
    const lastSegment = m.split('/').pop();
    const bySuffix = _dynamicCatalog.bySuffix.get(lastSegment);
    if (bySuffix) return { ...bySuffix };
  }

  // 3. Static fallback table
  const hit = MODEL_INFO.find(entry => entry.match.test(m));
  if (hit) {
    return { context: hit.context, inputPrice: hit.inputPrice, outputPrice: hit.outputPrice, reasoning: hit.reasoning };
  }
  return { ...DEFAULT_MODEL_INFO };
}

// ──────────────────────────────────────────────────────────────
//  Dynamic model catalog (spec 2026-08-25-dynamic-model-catalog)
//
//  OpenRouter publishes an unauthenticated catalog of every routed model:
//  GET https://openrouter.ai/api/v1/models
//    → { id, context_length, pricing: { prompt, completion } (USD/token),
//        supported_parameters: [... 'reasoning', 'include_reasoning', ...] }
//
//  The catalog is fetched once per startup (fire-and-forget), persisted to
//  .emile/models-cache.json and used as the primary metadata source. A
//  static table can never keep up with 400+ models — GLM 5.x, stealth
//  codename models and new releases all resolve correctly from here.
// ──────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;        // refetch after 24h
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // persisted cache valid 30 days

let _dynamicCatalog = null; // { byExact: Map, bySuffix: Map }

function catalogCachePath() {
  return path.join(process.cwd(), '.emile', 'models-cache.json');
}

/** Maps one OpenRouter catalog entry to emile's model-info shape. */
function mapCatalogEntry(entry) {
  const params = entry.supported_parameters || [];
  const reasoning =
    params.includes('reasoning') ||
    params.includes('include_reasoning') ||
    params.includes('reasoning_effort');
  const inputPrice = parseFloat(entry.pricing?.prompt ?? '0') * 1_000_000;
  const outputPrice = parseFloat(entry.pricing?.completion ?? '0') * 1_000_000;
  return {
    context: entry.context_length || DEFAULT_MODEL_INFO.context,
    inputPrice: Number.isFinite(inputPrice) ? inputPrice : DEFAULT_MODEL_INFO.inputPrice,
    outputPrice: Number.isFinite(outputPrice) ? outputPrice : DEFAULT_MODEL_INFO.outputPrice,
    reasoning,
  };
}

function buildCatalogIndexes(models) {
  const byExact = new Map();
  const bySuffix = new Map();
  const normalizedModels = [];
  for (const entry of models) {
    if (!entry || typeof entry.id !== 'string' || entry.id.trim() === '') continue;
    const info = mapCatalogEntry(entry);
    const id = entry.id.trim();
    byExact.set(id.toLowerCase(), info);
    // Last segment lets bare ids ('glm-4.6') match prefixed ones ('z-ai/glm-4.6')
    const seg = id.split('/').pop().toLowerCase();
    if (!bySuffix.has(seg)) bySuffix.set(seg, info);
    normalizedModels.push({ id, info });
  }
  return { byExact, bySuffix, models: normalizedModels };
}

function loadPersistedCatalog() {
  try {
    const cachePath = catalogCachePath();
    if (!fs.existsSync(cachePath)) return false;
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!parsed?.models?.length) return false;
    if (Date.now() - (parsed.fetchedAt || 0) > CACHE_MAX_AGE_MS) return false;
    _dynamicCatalog = buildCatalogIndexes(parsed.models);
    return true;
  } catch {
    return false;
  }
}

function persistCatalog(models) {
  try {
    const cachePath = catalogCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), models }), 'utf8');
  } catch { /* cache persistence is best-effort */ }
}

async function fetchCatalog() {
  const res = await fetch(CATALOG_URL, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
  const data = await res.json();
  const models = data?.data;
  if (!Array.isArray(models) || models.length === 0) throw new Error('empty catalog');
  return models;
}

/**
 * Fetches the OpenRouter public model catalog and indexes it as the primary
 * metadata source. Fire-and-forget at startup: never throws, never blocks —
 * on failure it falls back to the persisted cache, then to the static table.
 * @param {object} [options]
 * @param {boolean} [options.force] refetch even if a dynamic catalog exists
 * @param {boolean} [options.verbose] log the outcome
 * @returns {Promise<boolean>} true when a dynamic catalog is active
 */
export async function initModelCatalog({ force = false, verbose = false } = {}) {
  if (_dynamicCatalog && !force) return true;

  // Offline startup: seed from the persisted cache first
  let seededFromDisk = false;
  if (!_dynamicCatalog) {
    seededFromDisk = loadPersistedCatalog();
  }

  // Skip the network when the persisted cache is fresh (< 24h)
  let cachedFresh = false;
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogCachePath(), 'utf8'));
    cachedFresh = Date.now() - (parsed.fetchedAt || 0) < CATALOG_TTL_MS;
  } catch { /* no cache */ }

  if (_dynamicCatalog && !force && cachedFresh && seededFromDisk) {
    if (verbose) console.log(`[models] catalog from cache (${_dynamicCatalog.byExact.size} models)`);
    return true;
  }

  try {
    const models = await fetchCatalog();
    _dynamicCatalog = buildCatalogIndexes(models);
    persistCatalog(models);
    if (verbose) console.log(`[models] live catalog loaded (${models.length} models)`);
    return true;
  } catch (err) {
    if (verbose) console.log(`[models] catalog unavailable (${err.message}) — using ${_dynamicCatalog ? 'cached' : 'static'} metadata`);
    return !!_dynamicCatalog;
  }
}

/** Returns whether a live or persisted dynamic catalog is currently active. */
export function isDynamicCatalogActive() {
  return !!_dynamicCatalog;
}

/**
 * Lists normalized catalog models for providers backed by the catalog source.
 * The public source is OpenRouter-only, so other gateways retain their
 * curated lists instead of implying compatibility they cannot validate.
 */
export function getDynamicModels({ provider = '' } = {}) {
  if (!_dynamicCatalog || String(provider).toLowerCase() !== 'openrouter') return [];
  return _dynamicCatalog.models.map(({ id, info }) => ({ id, info: { ...info } }));
}

/**
 * True when the dynamic catalog recognises this model id (exact or by its
 * last path segment). Used by the connection wizard to validate that the
 * currently selected model exists for a newly chosen provider
 * (IMPROVEMENTS.md §4.2). Returns true when no catalog is active (cannot
 * validate) so callers only prompt when they actually know the model is
 * missing.
 */
export function isKnownModel(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return true;
  if (!_dynamicCatalog) return true;
  if (_dynamicCatalog.byExact.has(m)) return true;
  return _dynamicCatalog.bySuffix.has(m.split('/').pop());
}

// ──────────────────────────────────────────────────────────────
//  Provider model lists (OpenCode Zen / OpenCode Go)
//
//  OpenCode exposes an OpenAI-compatible `GET /models` endpoint per gateway:
//    https://opencode.ai/zen/v1/models    (OpenCode Zen)
//    https://opencode.ai/zen/go/v1/models (OpenCode Go)
//  The payload carries only ids, so display metadata still resolves through
//  getModelInfo() (static table + default fallback).
// ──────────────────────────────────────────────────────────────

const PROVIDER_MODEL_LIST_URLS = {
  opencode: 'https://opencode.ai/zen/v1/models',
  'opencode-go': 'https://opencode.ai/zen/go/v1/models',
};

const providerModelListCache = new Map(); // provider -> { fetchedAt, ids }

/** Extracts non-empty model ids from an OpenAI-compatible /models payload. */
export function parseProviderModelIds(data) {
  return (Array.isArray(data?.data) ? data.data : [])
    .map((entry) => (entry && typeof entry.id === 'string' ? entry.id.trim() : ''))
    .filter(Boolean);
}

async function fetchProviderModelIds(provider) {
  const url = PROVIDER_MODEL_LIST_URLS[provider];
  if (!url) return [];
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`model list HTTP ${res.status}`);
  const ids = parseProviderModelIds(await res.json());
  if (ids.length === 0) throw new Error('empty model list');
  return ids;
}

/**
 * Returns the live model list for the active provider as normalized
 * `{ id, info }` entries. OpenRouter uses its metadata catalog; OpenCode Zen
 * and OpenCode Go use their OpenAI-compatible `/models` endpoint. Returns []
 * when the provider has no remote list or the fetch fails, so callers keep
 * their curated options.
 * @param {object} [options]
 * @param {string} [options.provider]
 * @returns {Promise<Array<{id:string, info:object}>>}
 */
export async function getProviderModelOptions({ provider = '' } = {}) {
  const p = String(provider || '').toLowerCase();
  if (p === 'openrouter') {
    await initModelCatalog();
    return getDynamicModels({ provider: p });
  }
  if (PROVIDER_MODEL_LIST_URLS[p]) {
    const cached = providerModelListCache.get(p);
    if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
      return cached.ids.map((id) => ({ id, info: getModelInfo(id) }));
    }
    try {
      const ids = await fetchProviderModelIds(p);
      providerModelListCache.set(p, { fetchedAt: Date.now(), ids });
      return ids.map((id) => ({ id, info: getModelInfo(id) }));
    } catch {
      return [];
    }
  }
  return [];
}
