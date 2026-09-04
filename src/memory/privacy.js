import { MAX_RECORD_CHARS } from './constants.js';

const CREDENTIAL_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk|pk|gh[pousr]|glpat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*\S{8,}/i,
];

const IDENTIFIER_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{3}[-.]?\d{2}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/,
  /\b(?:bank|account|routing|conta|agência|agencia)\s*(?:number|número|numero|no\.?|#)?\s*[:=]\s*[A-Z0-9 -]{6,}/i,
];

const BYPASS_PATTERNS = [
  /\bignore (?:the )?(?:system|project|previous) (?:prompt|rules|instructions)\b/i,
  /\b(?:disable|bypass|turn off) (?:safe mode|security|confirmation)\b/i,
  /(?:--no-safe|rm\s+-rf|auto[- ]?approve|without asking|sem perguntar|sem confirmação)/i,
];

const SENSITIVE_PATTERN = /\b(?:health|medical|diagnosis|religion|politic(?:al|s)|sexual|ethnic|race|immigration|criminal|saúde|medic[oa]|diagnóstico|religião|política|sexual|etnia|raça|imigração|criminal)\b/i;

function luhnCandidate(text) {
  const candidates = String(text).match(/(?:\d[ -]?){13,19}/g) || [];
  return candidates.some(candidate => {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    let alternate = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let value = Number(digits[index]);
      if (alternate && (value *= 2) > 9) value -= 9;
      sum += value;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  });
}

export function normalizeMemoryText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assessMemoryText(value) {
  const text = normalizeMemoryText(value);
  if (!text) return { level: 'denied', code: 'empty', text };
  if (text.length > MAX_RECORD_CHARS) return { level: 'denied', code: 'too-long', text };
  if (CREDENTIAL_PATTERNS.some(pattern => pattern.test(text))) return { level: 'denied', code: 'credential', text };
  if (IDENTIFIER_PATTERNS.some(pattern => pattern.test(text)) || luhnCandidate(text)) {
    return { level: 'denied', code: 'high-risk-identifier', text };
  }
  if (BYPASS_PATTERNS.some(pattern => pattern.test(text))) return { level: 'denied', code: 'security-bypass', text };
  if (SENSITIVE_PATTERN.test(text)) return { level: 'sensitive', code: 'sensitive-topic', text };
  return { level: 'normal', code: 'ok', text };
}
