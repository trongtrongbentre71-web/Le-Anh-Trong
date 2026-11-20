import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFriendlyAiError,
  parseInlineTokens,
  parseMarkdownBlocks,
} from './chatFormat';

test('parseInlineTokens parses bold, italic, and inline code cleanly', () => {
  const tokens = parseInlineTokens('Điểm **P4** có sai số `3 mm` (*vượt ngưỡng*).');
  assert.deepEqual(tokens, [
    { type: 'text', value: 'Điểm ' },
    { type: 'bold', value: 'P4' },
    { type: 'text', value: ' có sai số ' },
    { type: 'code', value: '3 mm' },
    { type: 'text', value: ' (' },
    { type: 'italic', value: 'vượt ngưỡng' },
    { type: 'text', value: ').' },
  ]);
});

test('parseMarkdownBlocks parses headings, bullets, numbered items, and paragraphs', () => {
  const md = `### Kết quả kiểm tra\n1. **Kiểm tra mia:** Điểm P4 lệch 3mm\n- Đề xuất đo lại mia\nHoàn tất.`;
  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[0], { type: 'heading', text: 'Kết quả kiểm tra' });
  assert.deepEqual(blocks[1], {
    type: 'numbered',
    index: '1',
    text: '**Kiểm tra mia:** Điểm P4 lệch 3mm',
  });
  assert.deepEqual(blocks[2], { type: 'bullet', text: 'Đề xuất đo lại mia' });
  assert.deepEqual(blocks[3], { type: 'paragraph', text: 'Hoàn tất.' });
});

test('formatFriendlyAiError converts raw 503 JSON into clean retryable Vietnamese message', () => {
  const raw503 =
    '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';
  const res = formatFriendlyAiError(raw503, 503);
  assert.equal(res.retryable, true);
  assert.ok(res.message.includes('quá tải'));
  assert.ok(!res.message.includes('{"error"'));
});

test('formatFriendlyAiError identifies non-retryable API key error', () => {
  const res = formatFriendlyAiError('API_KEY_INVALID', 400);
  assert.equal(res.retryable, false);
  assert.ok(res.message.includes('Settings > Secrets'));
});
