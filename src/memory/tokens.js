const STOPWORDS = new Set([
  'a', 'ao', 'as', 'como', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'eu',
  'me', 'meu', 'minha', 'o', 'os', 'para', 'por', 'que', 'se', 'um', 'uma',
  'and', 'as', 'at', 'be', 'for', 'from', 'i', 'in', 'is', 'it', 'my', 'of', 'on',
  'that', 'the', 'to', 'with',
]);

const SYNONYMS = new Map([
  ['breve', 'concise'], ['brief', 'concise'], ['concisa', 'concise'], ['conciso', 'concise'],
  ['curta', 'concise'], ['curto', 'concise'], ['objetiva', 'concise'], ['objetivo', 'concise'],
  ['detalhada', 'detailed'], ['detalhado', 'detailed'], ['detalhes', 'detailed'],
  ['portugues', 'portuguese'], ['português', 'portuguese'],
  ['resposta', 'response'], ['respostas', 'response'], ['answers', 'response'],
  ['teste', 'test'], ['testes', 'test'], ['tests', 'test'],
]);

export function normalizeForMemory(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[^\p{L}\p{N}._:-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeMemory(value) {
  return normalizeForMemory(value)
    .split(' ')
    .filter(token => token.length > 1 && !STOPWORDS.has(token))
    .map(token => SYNONYMS.get(token) || token)
    .slice(0, 128);
}

export function memorySimilarity(left, right) {
  const a = new Set(tokenizeMemory(left));
  const b = new Set(tokenizeMemory(right));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function estimateMemoryTokens(value) {
  return Math.max(1, Math.ceil(String(value || '').length / 4));
}
