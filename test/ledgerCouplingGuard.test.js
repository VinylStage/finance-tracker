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

// 원장(`transactions`)을 훑는 SQL 상수를 **이름을 몰라도** 전부 찾는다.
//
// 예전에는 `TX_IN_RANGE` 하나를 이름으로 집었다. 그 사이 같은 파일에 `TX_ALL`
// 이 생겼고(#688), **컬럼이 같아서 아무것도 안 깨진 채로 통과했다.** 감시가
// 「무엇을 읽는가」 는 봤지만 「어디서 읽는가」 는 안 봤던 것이다.
//
// 이 테스트의 존재 이유가 «목록을 손으로 관리하면 샌다» 였는데, 상수 이름을
// 손으로 적는 순간 목록이 하나 더 생긴 셈이었다. 그래서 이름을 안 적는다 —
// `FROM transactions` 가 있는 템플릿 리터럴을 전부 집는다.
function ledgerQueries(source) {
  const out = [];
  for (const m of source.matchAll(/const\s+([A-Z_]+)\s*=\s*`([\s\S]*?)`/g)) {
    if (/FROM\s+transactions\b/i.test(m[2])) out.push({ name: m[1], sql: m[2] });
  }
  return out;
}

test('원장을 훑는 SQL 이 늘지 않았다 — 이름이 아니라 개수로 못박는다', () => {
  const names = ledgerQueries(read('src/routes/cardStrategy.js')).map((q) => q.name).sort();
  assert.deepStrictEqual(names, ['TX_ALL', 'TX_IN_RANGE'],
    '카드 라우트가 원장을 훑는 자리가 바뀌었다. 늘었다면 #532 의 결합 목록에 적고 '
    + '이 목록을 갱신한다 — 이름을 새로 지어 감시를 비껴가는 것을 막는다.');
});

// 상수들이 읽는 것을 **합쳐서** 본다.
//
// 상수마다 «똑같아야 한다» 로 두면 안 된다. 이 이슈가 묻는 것은 「카드 계산이
// 원장에서 **무엇을 읽는가**」 이고, 그 답은 **합집합**이다. 어느 한 쿼리가
// 자기한테 필요한 것만 고르는 것은 결합을 늘리지 않는다 — 오히려 줄인다.
//
// 똑같기를 요구하면 **안 쓰는 컬럼을 넣게 만든다.** 실제로 그 일이 났다 —
// #710 이 `TX_IN_RANGE` 에 `is_overseas` 를 더했는데, `TX_ALL`(#688 의 진단이
// 쓴다)은 그 값을 안 본다. 그런데도 넣어야 통과하게 되면, 이 테스트가 결합을
// **감시하는 것이 아니라 만들어 내는** 꼴이 된다.
//
// 합집합으로 봐도 감시는 그대로다. 어디든 컬럼이 늘면 합집합이 커지고, 전부에서
// 빠지면 작아진다. 둘 다 여기서 깨진다.
function ledgerUnion(source, re) {
  const out = new Set();
  for (const q of ledgerQueries(source)) {
    for (const m of q.sql.matchAll(re)) out.add(m[1]);
  }
  return [...out].sort();
}

test('원장에서 긁어 오는 컬럼 — 상수들을 합쳐서 본다', () => {
  const EXPECTED_COLS = [
    'amount', 'card_product_id', 'category_id', 'date', 'id',
    'merchant', 'origin', 'payment_method_id', 'payment_style',
  ];
  const cols = ledgerUnion(read('src/routes/cardStrategy.js'), /\bt\.([a-z_]+)/g);
  assert.deepStrictEqual(cols, EXPECTED_COLS,
    '카드 라우트가 원장에서 읽는 컬럼이 바뀌었다. 늘었다면 #532 의 결합 목록에 '
    + '적고 이 목록을 갱신한다.');
});

test('그 SQL 들이 조인하는 원장 표 — 상수들을 합쳐서 본다', () => {
  const EXPECTED_JOINED = ['categories', 'payment_methods'];
  const joined = ledgerUnion(read('src/routes/cardStrategy.js'), /JOIN\s+([a-z_]+)/g);
  assert.deepStrictEqual(joined, EXPECTED_JOINED,
    '카드 라우트가 조인하는 원장 표가 바뀌었다. 늘었다면 #532 의 결합 목록에 적는다.');
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
