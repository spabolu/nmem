import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatRequest, ModelClient } from './copilot.ts';
import { arr, ask, obj, OPUS, str } from './model.ts';
import type { Task } from './model.ts';

const TASK: Task<string, { readonly names: readonly string[] }> = {
  id: 'toy',
  version: 1,
  model: OPUS,
  maxOutputTokens: 100,
  rules: 'Name things.',
  render: (input) => input,
  answer: obj({ names: arr(str) }),
};

function clientOf(replies: readonly { readonly value: unknown; readonly outputTokens: number }[], seen: ChatRequest[]): ModelClient {
  let i = 0;
  return {
    async call(request) {
      seen.push(request);
      const reply = replies[i++] ?? { value: {}, outputTokens: 0 };
      return { key: `k${i}` as never, value: reply.value, usage: { inputTokens: 1, outputTokens: reply.outputTokens }, cached: false };
    },
    totals: () => ({ live: 0, cached: 0, usage: { inputTokens: 0, outputTokens: 0 } }),
  };
}

test('a reply cut off at its token limit is re-asked with four times the limit', async () => {
  const seen: ChatRequest[] = [];
  const answer = await ask(clientOf([{ value: {}, outputTokens: 100 }, { value: { names: ['a'] }, outputTokens: 120 }], seen), TASK, 'go', 'toy', (out) => ({ value: out.names, problems: [] }));
  assert.deepEqual(answer.value, ['a']);
  assert.deepEqual(seen.map((request) => request.maxOutputTokens), [100, 400]);
});

test('a malformed reply under its limit is re-asked with the same limit', async () => {
  const seen: ChatRequest[] = [];
  await ask(clientOf([{ value: {}, outputTokens: 10 }, { value: { names: [] }, outputTokens: 10 }], seen), TASK, 'go', 'toy', (out) => ({ value: out.names, problems: [] }));
  assert.deepEqual(seen.map((request) => request.maxOutputTokens), [100, 100]);
});

test('a bracketed handle and an array sent as JSON text parse as the plain answer', () => {
  const shape = obj({ start: str, names: arr(str) });
  assert.deepEqual(shape.parse({ start: '[L715]', names: '["[S2]", "keep [this]"]' }, 'answer'), { start: 'L715', names: ['S2', 'keep [this]'] });
});
