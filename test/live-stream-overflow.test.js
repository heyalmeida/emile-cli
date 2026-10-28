// live-stream-overflow.test.js — regression for the multiplied-response bug:
// once the streamed frame cannot be recalled with cursor-up (stdout is not a
// TTY, or the frame outgrew the terminal viewport), re-rendering the whole
// frame on every delta printed the accumulated text over and over.
// Related specs: 2026-09-03-live-response-streaming,
// 2026-09-24-stream-viewport-seal.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';

function captureStdout({ tty = false, rows = 24 } = {}) {
  const writes = [];
  const original = process.stdout.write.bind(process.stdout);
  const originalIsTTY = process.stdout.isTTY;
  const originalRows = process.stdout.rows;
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  if (tty) {
    process.stdout.isTTY = true;
    process.stdout.rows = rows;
  }
  return {
    text: () => writes.join(''),
    restore() {
      process.stdout.write = original;
      if (tty) {
        if (originalIsTTY === undefined) delete process.stdout.isTTY;
        else process.stdout.isTTY = originalIsTTY;
        if (originalRows === undefined) delete process.stdout.rows;
        else process.stdout.rows = originalRows;
      }
    },
  };
}

const MARKER = 'QUIZMARKER86';
const PARAGRAPH = (
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\n'
);

function longParagraphs(count) {
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? `${MARKER} ${PARAGRAPH}` : PARAGRAPH
  );
}

async function streamLongResponse(paragraphs) {
  const output = captureStdout();
  try {
    const messages = await runAgent({
      model: 'test/live-stream',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Write the report',
      createCompletion: async function* () {
        for (const paragraph of paragraphs) {
          yield { choices: [{ delta: { content: paragraph } }] };
        }
      },
    });
    return { messages, text: output.text() };
  } finally {
    output.restore();
  }
}

test('piped (non-TTY) long streams print each rendered line exactly once', async () => {
  const { messages, text } = await streamLongResponse(longParagraphs(30));

  assert.equal(messages.at(-1).role, 'assistant');
  assert.equal(
    text.split(MARKER).length - 1, 1,
    'the response text must appear exactly once in piped output'
  );
  assert.equal((text.match(/╭─/g) || []).length, 1, 'the response box is opened once');
  assert.match(text, /commodo consequat\./, 'the final paragraph is fully flushed');
});

test('TTY streams taller than the viewport seal the frame instead of re-printing it', async () => {
  // 24-row terminal: the first delta still fits the redrawable frame, the
  // second outgrows it, so the seal transition (blank last row, re-emit once
  // final) is exercised. Raw bytes are safe to assert on because the marker
  // only ever lived in the first frame row.
  const output = captureStdout({ tty: true, rows: 10 });
  try {
    const paragraphs = longParagraphs(30);
    const run = runAgent({
      model: 'test/live-stream',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Write the report',
      createCompletion: async function* () {
        for (const paragraph of paragraphs) {
          yield { choices: [{ delta: { content: paragraph } }] };
        }
      },
    });
    const messages = await run;
    const text = output.text();

    assert.equal(messages.at(-1).role, 'assistant');
    assert.equal(
      text.split(MARKER).length - 1, 1,
      'the response text must appear exactly once even after viewport overflow'
    );
    assert.equal((text.match(/╭─/g) || []).length, 1, 'the response box is opened once');
    assert.match(text, /commodo consequat\./, 'the final paragraph is fully flushed');
  } finally {
    output.restore();
  }
});
