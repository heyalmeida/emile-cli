/**
 * Baudot ITA-2 encoding table.
 *
 * Source: ITU Recommendation ITA-2 (1930), the standardized 5-bit teleprinter
 * code that replaced Baudot's 1874 original and stayed in use until ASCII.
 *
 * Two modes — Letters (LTRS) and Figures (FIGS) — share the same 5-bit space;
 * mode is flipped by dedicated shift characters. This is why a 32-symbol code
 * carried a full alphabet plus digits plus punctuation: a trade-off modern
 * tokenizers make every day.
 *
 * Frames returned are the unit of transmission: either a data character or a
 * shift marker. Each frame is exactly 5 bits; a "hello" is 5 frames × 5 bits
 * = 25 bits on the wire (plus start/stop bits the physical layer adds).
 */

export const SHIFT = {
  LTRS: 0b11111,
  FIGS: 0b11011,
  NULL: 0b00000
};

const LTRS = {
  A: 0b11000, B: 0b10011, C: 0b01110, D: 0b10010, E: 0b10000,
  F: 0b10110, G: 0b01011, H: 0b00101, I: 0b01100, J: 0b11010,
  K: 0b11110, L: 0b01001, M: 0b00111, N: 0b00110, O: 0b00011,
  P: 0b01101, Q: 0b11101, R: 0b01010, S: 0b10100, T: 0b00001,
  U: 0b11100, V: 0b01111, W: 0b11001, X: 0b10111, Y: 0b10101,
  Z: 0b10001
};

const FIGS = {
  '1': 0b11000, '2': 0b10011, '3': 0b01110, '4': 0b10010, '5': 0b10000,
  '6': 0b10110, '7': 0b01011, '8': 0b00101, '9': 0b01100, '0': 0b11010,
  '\n': 0b01010, '\r': 0b00010, ' ': 0b00100
};

/**
 * Encode a string into Baudot ITA-2 frames.
 * Letters are uppercased. Digits are supported. Other punctuation becomes ⌷.
 *
 * @param {string} input
 * @returns {{ frames: Array, bits: number, letters: number, figures: number, shifts: number, roundtrip: string }}
 */
export function encodeBaudot(input) {
  const text = String(input || '');
  let mode = 'LTRS';
  const frames = [];
  let roundtrip = '';

  for (const ch of text) {
    if (ch === ' ' || ch === '\n' || ch === '\r') {
      const code = FIGS[' ']; // space lives in FIGS table as 00100
      if (mode !== 'FIGS') {
        frames.push({ code: SHIFT.FIGS, symbol: 'FIGS', mode, isControl: true });
        mode = 'FIGS';
      }
      frames.push({ code, symbol: ' ', mode, isControl: false });
      roundtrip += ' ';
      continue;
    }

    const upper = ch.toUpperCase();
    if (LTRS[upper]) {
      if (mode !== 'LTRS') {
        frames.push({ code: SHIFT.LTRS, symbol: 'LTRS', mode, isControl: true });
        mode = 'LTRS';
      }
      frames.push({ code: LTRS[upper], symbol: upper, mode, isControl: false });
      roundtrip += upper;
    } else if (FIGS[ch]) {
      if (mode !== 'FIGS') {
        frames.push({ code: SHIFT.FIGS, symbol: 'FIGS', mode, isControl: true });
        mode = 'FIGS';
      }
      frames.push({ code: FIGS[ch], symbol: ch, mode, isControl: false });
      roundtrip += ch;
    } else {
      // unmapped character — drop, no signal
      frames.push({ code: SHIFT.NULL, symbol: '∅', mode, isControl: true });
    }
  }

  return {
    frames,
    bits: frames.length * 5,
    letters: frames.filter(f => !f.isControl && f.mode === 'LTRS').length,
    figures: frames.filter(f => !f.isControl && f.mode === 'FIGS').length,
    shifts: frames.filter(f => f.isControl).length,
    roundtrip
  };
}

/** 5-bit code as ◼/◻ for visual pulse display. */
export function pulsePattern(code) {
  return Array.from({ length: 5 }, (_, i) => {
    return (code >> (4 - i)) & 1 ? '◼' : '◻';
  }).join('');
}

/** 5-bit code as 10110 binary string. */
export function bitString(code) {
  return Array.from({ length: 5 }, (_, i) => ((code >> (4 - i)) & 1)).join('');
}
