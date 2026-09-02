// definitions.js — conditional function schemas for enhanced web access.

const SEARCH_WEB_DEFINITION = {
  type: 'function',
  function: {
    name: 'searchWeb',
    description: 'Search the current web through Tavily. Returns ranked sources and bounded image references. This is billable and does not render every result.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Focused search query, at most 500 characters. Never include credentials, private code or user data.' },
        maxResults: { type: 'integer', minimum: 1, maximum: 7, description: 'Number of ranked results; defaults to 5.' },
        depth: { type: 'string', enum: ['basic', 'advanced'], description: 'Search depth; advanced costs more and is the default.' },
        includeImages: { type: 'boolean', description: 'Include up to three image references when available.' },
      },
      required: ['query'],
    },
  },
};

const BROWSE_PAGE_DEFINITION = {
  type: 'function',
  function: {
    name: 'browsePage',
    description: 'Render one public HTTP(S) page through Firecrawl. Returns bounded Markdown and optionally one screenshot for visual/design analysis. This is billable.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute public HTTP(S) URL without credentials or private authentication parameters.' },
        mode: { type: 'string', enum: ['text', 'visual', 'auto'], description: 'Use visual for layout/design; text for content; auto defaults to a visual-capable result.' },
      },
      required: ['url'],
    },
  },
};

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

export function getEnhancedWebToolDefinitions(runtimeConfig = {}) {
  if (runtimeConfig.webSearch !== true || runtimeConfig.webSearchMode !== 'enhanced') return [];
  const definitions = [];
  if (runtimeConfig.tavilyEnabled === true && runtimeConfig.tavilyApiKey) {
    definitions.push(cloneDefinition(SEARCH_WEB_DEFINITION));
  }
  if (runtimeConfig.firecrawlEnabled === true && runtimeConfig.firecrawlApiKey) {
    definitions.push(cloneDefinition(BROWSE_PAGE_DEFINITION));
  }
  return definitions;
}
