// model-capabilities.js — conservative image-input gate for web screenshots.

// Keep this fail-closed: a false negative leaves the rendered Markdown usable,
// while a false positive can make the active gateway reject the whole turn.
const IMAGE_INPUT_PATTERNS = [
  /(?:^|\/)claude(?:-|$)/,
  /(?:^|\/)gemini(?:-|$)/,
  /(?:^|\/)gpt-4(?:o|\.1|-turbo)(?:-|$)/,
  /(?:^|\/)o[134](?:-|$)/,
  /(?:^|\/)(?:qwen[^/]*-vl|qvq)(?:-|$)/,
  /(?:^|\/)(?:pixtral|mistral-small-3\.1)(?:-|$)/,
  /(?:^|\/)llama-3\.2-[^/]*vision(?:-|$)/,
];

export function modelSupportsImages(model) {
  const normalized = String(model || '').trim().toLowerCase();
  if (!normalized || /openrouter\/free|:free(?:$|\/)/.test(normalized)) return false;
  return IMAGE_INPUT_PATTERNS.some(pattern => pattern.test(normalized));
}
