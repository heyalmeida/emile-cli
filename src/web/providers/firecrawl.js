// firecrawl.js — bounded rendered-page REST adapter.
import {
  MAX_WEB_MARKDOWN_CHARS,
  WEB_REQUEST_TIMEOUT_MS,
  boundedRemoteText,
  formatWebProviderError,
  readBoundedJson,
  validatePublicWebUrl,
} from '../security.js';

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';

export async function browseFirecrawl(args = {}, {
  apiKey,
  fetchImpl = fetch,
  lookup,
  signal = AbortSignal.timeout(WEB_REQUEST_TIMEOUT_MS),
} = {}) {
  if (!apiKey) throw new Error('Firecrawl is not configured. Run /firecrawl.');
  const url = await validatePublicWebUrl(args.url, { lookup, rejectSensitiveQuery: true });
  const mode = ['text', 'visual', 'auto'].includes(args.mode) ? args.mode : 'auto';
  const wantsScreenshot = mode !== 'text';
  const formats = ['markdown'];
  if (wantsScreenshot) {
    formats.push({
      type: 'screenshot',
      fullPage: true,
      quality: 70,
      viewport: { width: 1440, height: 900 },
    });
  }

  let response;
  try {
    response = await fetchImpl(FIRECRAWL_SCRAPE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats,
        onlyMainContent: true,
        timeout: WEB_REQUEST_TIMEOUT_MS,
      }),
      signal,
    });
  } catch (error) {
    throw new Error(formatWebProviderError('firecrawl', error));
  }

  if (!response.ok) throw new Error(formatWebProviderError('firecrawl', response));
  let payload;
  try {
    payload = await readBoundedJson(response);
  } catch {
    throw new Error('Firecrawl returned an invalid or oversized response.');
  }

  const data = payload?.data;
  const markdown = boundedRemoteText(data?.markdown, MAX_WEB_MARKDOWN_CHARS);
  if (!payload?.success || !data || !markdown) {
    throw new Error('Firecrawl returned no usable rendered content.');
  }

  let screenshotUrl = null;
  let screenshotWarning = '';
  if (wantsScreenshot && data.screenshot) {
    try {
      screenshotUrl = await validatePublicWebUrl(data.screenshot, { lookup, requireHttps: true });
    } catch {
      screenshotWarning = 'Firecrawl returned an unsafe or unreachable screenshot URL; it was not attached.';
    }
  } else if (wantsScreenshot) {
    screenshotWarning = 'Firecrawl did not return a screenshot for this page.';
  }

  return {
    url,
    title: boundedRemoteText(data?.metadata?.title, 300),
    markdown,
    screenshotUrl,
    screenshotWarning,
  };
}
