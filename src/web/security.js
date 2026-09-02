// security.js — trust boundary for enhanced-web URLs, payloads and errors.
import dns from 'node:dns';
import net from 'node:net';

export const MAX_WEB_QUERY_CHARS = 500;
export const MAX_WEB_RESULTS = 7;
export const MAX_WEB_IMAGES = 3;
export const MAX_WEB_MARKDOWN_CHARS = 24_000;
export const MAX_WEB_JSON_BYTES = 2 * 1024 * 1024;
export const WEB_REQUEST_TIMEOUT_MS = 30_000;

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);
const SENSITIVE_QUERY_KEYS = /^(?:api[_-]?key|access[_-]?token|auth|authorization|password|secret|token)$/i;
const LIKELY_SECRET_PATTERN = /(?:\b(?:api[_-]?key|access[_-]?token|authorization|password|secret|token)\b\s*[:=]\s*\S{8,}|\bbearer\s+\S{8,}|\b(?:sk|tvly|fc)-[a-z0-9_-]{12,})/i;

function parseIpv4(address) {
  const parts = String(address).split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(part => Number(part));
  if (octets.some((part, index) => !/^\d+$/.test(parts[index]) || part < 0 || part > 255)) return null;
  return octets;
}

function isPublicIpv4(address) {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b, c] = octets;

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(address) {
  const normalized = String(address).toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return false;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4[1]);

  if (/^f[cd]/.test(normalized)) return false; // unique-local fc00::/7
  if (/^fe[89ab]/.test(normalized)) return false; // link-local fe80::/10
  if (/^ff/.test(normalized)) return false; // multicast ff00::/8
  if (/^2001:db8(?::|$)/.test(normalized)) return false; // documentation
  if (/^2001:0(?::|$)/.test(normalized)) return false; // Teredo/reserved
  if (/^2002(?::|$)/.test(normalized)) return false; // 6to4
  if (/^64:ff9b(?::|$)/.test(normalized)) return false; // NAT64 embedding
  return true;
}

export function isPublicIpAddress(address) {
  const version = net.isIP(String(address).replace(/^\[|\]$/g, ''));
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(String(address).replace(/^\[|\]$/g, ''));
  return false;
}

export function normalizeHttpUrl(value, {
  requireHttps = false,
  rejectSensitiveQuery = false,
} = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('URL must be a valid absolute HTTP(S) address.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL protocol must be HTTP or HTTPS.');
  }
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new Error('Image URL must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL must not contain embedded credentials.');
  }
  if (rejectSensitiveQuery && [...parsed.searchParams.keys()].some(key => SENSITIVE_QUERY_KEYS.test(key))) {
    throw new Error('URL must not contain sensitive authentication parameters.');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname.length > 253 || LOCAL_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('URL hostname is local or invalid.');
  }

  parsed.hash = '';
  return parsed;
}

export async function validatePublicWebUrl(value, {
  lookup = dns.promises.lookup,
  requireHttps = false,
  rejectSensitiveQuery = false,
} = {}) {
  const parsed = normalizeHttpUrl(value, { requireHttps, rejectSensitiveQuery });
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw new Error('URL target must use a public IP address.');
    return parsed.toString();
  }

  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('URL hostname could not be resolved.');
  }
  const addresses = Array.isArray(records) ? records : [records];
  if (addresses.length === 0 || addresses.some(record => !isPublicIpAddress(record?.address))) {
    throw new Error('URL hostname must resolve only to public IP addresses.');
  }
  return parsed.toString();
}

export function normalizeWebQuery(value) {
  const query = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query) throw new Error('Search query cannot be empty.');
  if (query.length > MAX_WEB_QUERY_CHARS) {
    throw new Error(`Search query must not exceed ${MAX_WEB_QUERY_CHARS} characters.`);
  }
  if (LIKELY_SECRET_PATTERN.test(query)) {
    throw new Error('Search query appears to contain a credential or secret.');
  }
  return query;
}

export function boundedRemoteText(value, maxChars = MAX_WEB_MARKDOWN_CHARS) {
  const cleaned = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}\n[truncated by Emile]`;
}

export async function readBoundedJson(response, maxBytes = MAX_WEB_JSON_BYTES) {
  const declaredSize = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error('provider response exceeded the size limit');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error('provider response exceeded the size limit');
  }
  if (!text.trim()) throw new Error('provider returned an empty response');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('provider returned invalid JSON');
  }
}

export function formatWebProviderError(provider, errorOrResponse) {
  const label = provider === 'firecrawl' ? 'Firecrawl' : 'Tavily';
  const status = Number(errorOrResponse?.status);
  const name = String(errorOrResponse?.name || '');

  if (name === 'AbortError' || name === 'TimeoutError') return `${label} request timed out.`;
  if (status === 401 || status === 403) return `${label} authentication failed. Reconfigure /${provider}.`;
  if (status === 402) return `${label} rejected the request because credits or billing are unavailable.`;
  if (status === 429) return `${label} rate limit reached. Try again later.`;
  if (status >= 500) return `${label} is temporarily unavailable (${status}).`;
  if (status >= 400) return `${label} rejected the request (${status}).`;
  return `${label} request failed.`;
}
