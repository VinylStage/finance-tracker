'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 소스에서 `tx.<필드>` 를 전부 뽑아 정렬한 목록
function txFields(source) {
  return [...new Set([...source.matchAll(/\btx\.([a-z_]+)/g)].map((m) => m[1]))].sort();
}

test('혜택 계산이 거래에서 읽는 값', () => {
  const actual = txFields(read('src/services/cardComparison.js'));
  const EXPECTED_COMPARISON = [
    'amount', 'card_product_id', 'category_id', 'date', 'id',
    'merchant', 'origin', 'payment_method_type', 'payment_style',
  ];
  assert.deepStrictEqual(actual, EXPECTED_COMPARISON,
    '혜택 계산이 원장에서 읽는 값이 바뀌었다. 늘었다면 #532 의 결합 목록에 적고 '
    + '이 목록을 갱신한다 — 모르고 느는 것을 막는 것이 이 테스트의 목적이다.');
});

test('실적 계산이 거래에서 읽는 값', () => {
  const actual = txFields(read('src/services/cardThreshold.js'));
  const EXPECTED_THRESHOLD = ['amount', 'date', 'id', 'major_type', 'origin'];
  assert.deepStrictEqual(actual, EXPECTED_THRESHOLD,
    '실적 계산이 원장에서 읽는 값이 바뀌었다. 늘었다면 #532 의 결합 목록에 적고 '
    + '이 목록을 갱신한다 — 모르고 느는 것을 막는 것이 이 테스트의 목적이다.');
});

test('원장에서 긁어 오는 SQL 이 고르는 컬럼', () => {
  const sql = read('src/routes/cardStrategy.js').match(/const TX_IN_RANGE = `([\s\S]*?)`/)[1];
  const cols = [...new Set([...sql.matchAll(/\bt\.([a-z_]+)/g)].map((m) => m[1]))].sort();
  const EXPECTED_COLS = [
    'amount', 'card_product_id', 'category_id', 'date', 'id',
    'merchant', 'origin', 'payment_method_id', 'payment_style',
  ];
  assert.deepStrictEqual(cols, EXPECTED_COLS);
});

test('그 SQL 이 조인하는 원장 표', () => {
  const sql = read('src/routes/cardStrategy.js').match(/const TX_IN_RANGE = `([\s\S]*?)`/)[1];
  const joined = [...new Set([...sql.matchAll(/JOIN\s+([a-z_]+)/g)].map((m) => m[1]))].sort();
  const EXPECTED_JOINED = ['categories', 'payment_methods'];
  assert.deepStrictEqual(joined, EXPECTED_JOINED);
});

test('카드 표가 원장을 참조하는 외래키', () => {
  const files = fs.readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.js'));
  const filteredFiles = files.filter((f) => f.includes('card') || f.includes('benefit') || f.includes('threshold'));
  const refs = [];
  for (const f of filteredFiles) {
    const src = read(path.join('migrations', f));
    for (const m of src.matchAll(/([a-z_]+)\s+INTEGER[^,\n]*REFERENCES\s+(transactions|categories|payment_methods)\(/g)) {
      refs.push(`${f}:${m[1]}→${m[2]}`);
    }
  }
  refs.sort();
  const EXPECTED_REFS = [
    '006-add-card-installment-policies.js:payment_method_id→payment_methods',
    '019-card-benefits.js:category_id→categories',
    '026-card-threshold-tiers.js:transaction_id→transactions',
  ];
  assert.deepStrictEqual(refs, EXPECTED_REFS,
    '카드 표가 원장을 새로 참조하면 #532 의 허용 접점(실적기간 · 거래→카드 연결) 밖이다');
});
