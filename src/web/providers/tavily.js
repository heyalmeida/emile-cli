// tavily.js — bounded Tavily Search REST adapter.
import {
  MAX_WEB_IMAGES,
  MAX_WEB_RESULTS,
  WEB_REQUEST_TIMEOUT_MS,
  boundedRemoteText,
  formatWebProviderError,
  normalizeHttpUrl,
  normalizeWebQuery,
  readBoundedJson,
} from '../security.js';

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

function boundedInteger(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? Math.min(number, max) : fallback;
}

function safeReferenceUrl(value) {
  try {
    return normalizeHttpUrl(value).toString();
  } catch {
    return null;
  }
}

export async function searchTavily(args = {}, {
  apiKey,
  fetchImpl = fetch,
  signal = AbortSignal.timeout(WEB_REQUEST_TIMEOUT_MS),
} = {}) {
  if (!apiKey) throw new Error('Tavily is not configured. Run /tavily.');
  const query = normalizeWebQuery(args.query);
  const maxResults = boundedInteger(args.maxResults, 5, MAX_WEB_RESULTS);
  const depth = args.depth === 'basic' ? 'basic' : 'advanced';
  const includeImages = args.includeImages !== false;

  let response;
  try {
    response = await fetchImpl(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        search_depth: depth,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: includeImages,
        include_image_descriptions: includeImages,
      }),
      signal,
    });
  } catch (error) {
    throw new Error(formatWebProviderError('tavily', error));
  }

  if (!response.ok) throw new Error(formatWebProviderError('tavily', response));
  let payload;
  try {
    payload = await readBoundedJson(response);
  } catch {
    throw new Error('Tavily returned an invalid or oversized response.');
  }

  const results = Array.isArray(payload?.results)
    ? payload.results.slice(0, maxResults).flatMap((result) => {
        const url = safeReferenceUrl(result?.url);
        if (!url) return [];
        return [{
          title: boundedRemoteText(result?.title, 300) || 'Untitled result',
          url,
          content: boundedRemoteText(result?.content, 2_000),
          score: Number.isFinite(Number(result?.score)) ? Number(result.score) : null,
        }];
      })
    : [];

  const images = includeImages && Array.isArray(payload?.images)
    ? payload.images.slice(0, MAX_WEB_IMAGES).flatMap((image) => {
        const source = typeof image === 'string' ? image : image?.url;
        const url = safeReferenceUrl(source);
        if (!url) return [];
        return [{
          url,
          description: boundedRemoteText(typeof image === 'string' ? '' : image?.description, 500),
        }];
      })
    : [];

  if (results.length === 0) throw new Error('Tavily returned no usable search results.');
  return { query, depth, results, images };
}
