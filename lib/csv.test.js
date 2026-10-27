const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('./csv');

test('parses plain rows', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('handles quoted commas, escaped quotes and embedded newlines', () => {
  const input = 'a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",3';
  assert.deepEqual(parseCsv(input), [
    ['a', 'b'],
    ['x, y', 'say "hi"'],
    ['line1\nline2', '3'],
  ]);
});

test('skips blank lines and a UTF-8 BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('keeps empty fields', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,\n'), [['a', 'b', 'c'], ['1', '', '']]);
});
