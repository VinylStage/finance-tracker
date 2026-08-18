const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21507 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21507;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
// 카테고리 id 는 서버를 띄운 뒤 만들어 담는다. 숫자로 적지 않는다.
let categoryId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const res = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '변동필수', name: '불러오기테스트' }),
  });
  const body = await res.json();
  categoryId = body.id;
});

after(() => {
  if (server) server.stop();
});

// **`mode` 를 반드시 보낸다.** 없으면 400 «불러오기 방식을 선택해 주세요» 로 막힌다.
async function importRows(rows) {
  const res = await fetch(`${BASE}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'append', transactions: rows }),
  });
  return { status: res.status, body: await res.json() };
}

// 신버전 백업의 한 줄. 필드가 **전부 있다**(값이 null 이어도 키는 있다).
function fullRow(date, over = {}) {
  return {
    date,
    amount: 1000,
    category_id: categoryId,
    category_name: '불러오기테스트',
    merchant: '가맹',
    memo: null,
    payment_method_id: null,
    payment_style: '일시불',
    approval_number: null,
    installment_id: null,
    created_at: '2026-08-01 00:00:00',
    ...over,
  };
}

test('온전한 백업에는 알림이 안 붙는다', async () => {
  const result = await importRows([fullRow('2026-08-01')]);
  assert.strictEqual(result.body.imported, 1);
  assert.strictEqual(result.body.legacy_fields_defaulted, undefined);
  assert.strictEqual(result.body.fk_fallback, undefined);
});

test('구버전 백업이면 기본값을 채웠다고 알린다', async () => {
  const legacy = {
    date: '2026-08-02', amount: 2000,
    category_id: categoryId, category_name: '불러오기테스트', merchant: '가맹',
  };
  const result = await importRows([legacy]);
  assert.strictEqual(result.body.legacy_fields_defaulted, true);
  assert.strictEqual(result.body.imported, 1);
});

test('없는 결제수단 id 는 비우고 알린다', async () => {
  const result = await importRows([fullRow('2026-08-03', { payment_method_id: 99999 })]);
  assert.strictEqual(result.body.fk_fallback, true);
  assert.strictEqual(result.body.imported, 1);
});

test('없는 할부 id 도 같다', async () => {
  const result = await importRows([fullRow('2026-08-04', { installment_id: 88888 })]);
  assert.strictEqual(result.body.fk_fallback, true);
  assert.strictEqual(result.body.imported, 1);
});

test('날짜 형식이 틀린 줄은 건너뛴다', async () => {
  const result = await importRows([fullRow('2026/08/05')]);
  assert.strictEqual(result.body.imported, 0);
  assert.strictEqual(result.body.skipped, 1);
  assert.strictEqual(result.body.fk_fallback, undefined);
});

// 아래 한 건은 위임 산출이 아니라 사람이 더한 것이다. 위 다섯 중 「구버전 백업」 케이스가
// **레거시 필드를 전부 뺀** 줄을 써서, 판정 조건에서 하나를 없애도 다른 조건이 여전히
// 참이라 결과가 안 바뀌었다 — 돌연변이가 관찰되지 않았다(fail 0).
//
// 판정은 **다섯 필드 중 하나라도 없으면** 구버전이다. 그 «하나라도» 를 잠그려면
// 하나씩만 뺀 줄이 필요하다.
test('레거시 필드가 하나만 없어도 구버전으로 본다', async () => {
  const KEYS = ['payment_style', 'payment_method_id', 'approval_number', 'installment_id', 'created_at'];

  for (let i = 0; i < KEYS.length; i += 1) {
    const row = fullRow(`2026-09-0${i + 1}`);
    delete row[KEYS[i]];

    const res = await importRows([row]);
    assert.strictEqual(res.body.imported, 1, `${KEYS[i]} 가 없을 때 복원이 안 됐다`);
    assert.strictEqual(
      res.body.legacy_fields_defaulted, true,
      `${KEYS[i]} 하나만 없는데 구버전으로 안 봤다`
    );
  }
});
