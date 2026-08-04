'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

// 기존 거래를 카드 상품에 붙이는 재매핑(#302 3단계).
//
// 실사용 DB 에서 하나카드 260건이 한 번에 바뀐다. ADR 0008 이 이 규모를 근거로
// 프리뷰 → 확인 2단계를 요구했고, 같은 ADR 이 "지켜지지 않을 수 있는 지점" 으로
// 두 가지를 적어 뒀다. 이 파일이 둘 다 고정한다.
//
//   1. 프리뷰가 조용히 쓰기를 하면 원칙이 무의미해진다
//   2. API 를 직접 호출하면 프리뷰를 건너뛸 수 있다

const PORT = 34713; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

const post = (pathname, body) => json(pathname, { method: 'POST', body: JSON.stringify(body) });

const preview = (body) => post('/api/card-products/remap/preview', body);
const remap = (body) => post('/api/card-products/remap', body);

let categoryId;
let hanaId;      // 카드사 (신용)
let samsungId;   // 다른 카드사
let cashId;      // 카드 아닌 결제수단
let cardA;       // 하나카드 아래 카드 두 장
let cardB;
let samsungCard; // 삼성카드 아래 카드

// 서버가 쓰는 것과 같은 파일을 직접 열어 본다. 라우트를 거치지 않고 확인해야
// "프리뷰가 DB 를 바꿨는가" 를 라우트의 주장이 아니라 파일로 판정할 수 있다.
function openDb() {
  return new Database(server.dbPath, { readonly: true });
}

function snapshot() {
  const db = openDb();
  try {
    return db.prepare('SELECT id, card_product_id FROM transactions ORDER BY id').all();
  } finally {
    db.close();
  }
}

async function addTx(over = {}) {
  const created = await post('/api/transactions', {
    date: '2026-05-15', category_id: categoryId, amount: 10000, merchant: '가맹점', ...over,
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

// 이미 어느 카드로 지정된 거래를 만든다. 재매핑 자신을 써서 만드는 것이 실제
// 흐름과 같다 — 사용자는 한 번 옮긴 뒤에야 "저건 다른 카드였다" 를 깨닫는다.
async function assignTo(cardId, criteria = {}) {
  const p = await preview({ card_product_id: cardId, ...criteria });
  assert.strictEqual(p.status, 200, JSON.stringify(p.body));
  const r = await remap({ card_product_id: cardId, ...criteria, preview_token: p.body.preview_token });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  return r.body.updated;
}

before(async () => {
  server = await startTestServer({ port: PORT });

  const cats = await json('/api/categories');
  categoryId = (cats.body.data || cats.body)[0].id;

  const pms = await json('/api/payment-methods');
  const methods = pms.body.data || pms.body;
  const cards = methods.filter((m) => m.type === '신용' || m.type === '체크');
  hanaId = cards[0].id;
  samsungId = cards[1].id;
  cashId = methods.find((m) => m.type !== '신용' && m.type !== '체크').id;

  const mk = async (methodId, name) => {
    const r = await post('/api/card-products', {
      payment_method_id: methodId, issuer: '테스트발급사', product_name: name, card_type: '신용',
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  };
  cardA = await mk(hanaId, '하나 A카드');
  cardB = await mk(hanaId, '하나 B카드');
  samsungCard = await mk(samsungId, '삼성 iD ON');
});

after(() => {
  if (server) server.stop();
});

// 각 케이스가 자기 거래만 보게 매번 비운다. 재매핑은 조건에 걸린 것을 전부
// 옮기므로 앞 케이스가 남긴 거래가 건수에 섞이면 단언이 무의미해진다.
beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
});

describe('A. 프리뷰는 DB 를 바꾸지 않는다', () => {
  test('A-1. 프리뷰를 불러도 거래의 카드 지정이 그대로다', async () => {
    await addTx({ payment_method_id: hanaId });
    await addTx({ payment_method_id: hanaId });
    const before = snapshot();

    const r = await preview({ card_product_id: cardA });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.count, 2);

    assert.deepStrictEqual(snapshot(), before);
  });

  test('A-2. 조건을 바꿔 가며 여러 번 불러도 그대로다', async () => {
    await addTx({ payment_method_id: hanaId, date: '2026-01-10' });
    await addTx({ payment_method_id: hanaId, date: '2026-06-20' });
    const before = snapshot();

    await preview({ card_product_id: cardA });
    await preview({ card_product_id: cardA, from: '2026-01-01', to: '2026-03-31' });
    await preview({ card_product_id: cardA, merchant: '가맹점' });
    await preview({ card_product_id: cardA, min_amount: 5000, max_amount: 20000 });

    assert.deepStrictEqual(snapshot(), before);
  });

  test('A-3. 잘못된 조건으로 거절돼도 그대로다', async () => {
    await addTx({ payment_method_id: hanaId });
    const before = snapshot();

    const r = await preview({ card_product_id: 99999 });
    assert.strictEqual(r.status, 400);

    assert.deepStrictEqual(snapshot(), before);
  });
});

describe('B. 프리뷰를 건너뛸 수 없다', () => {
  test('B-1. 지문 없이 실행하면 428 이고 아무것도 안 바뀐다', async () => {
    await addTx({ payment_method_id: hanaId });
    const before = snapshot();

    const r = await remap({ card_product_id: cardA });
    assert.strictEqual(r.status, 428);
    assert.strictEqual(r.body.preview_required, true);

    assert.deepStrictEqual(snapshot(), before);
  });

  test('B-2. 틀린 지문은 409 다', async () => {
    await addTx({ payment_method_id: hanaId });
    const r = await remap({ card_product_id: cardA, preview_token: 'deadbeef' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.preview_stale, true);
  });

  test('B-3. 프리뷰 뒤 대상이 늘면 그 지문은 만료된다', async () => {
    await addTx({ payment_method_id: hanaId });
    const p = await preview({ card_product_id: cardA });

    // 사용자가 확인하는 사이 거래가 하나 더 들어왔다.
    await addTx({ payment_method_id: hanaId });

    const r = await remap({ card_product_id: cardA, preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.preview_stale, true);
  });

  test('B-4. 프리뷰 뒤 대상이 다른 카드로 지정돼도 만료된다', async () => {
    const id = await addTx({ payment_method_id: hanaId });
    await addTx({ payment_method_id: hanaId });
    const p = await preview({ card_product_id: cardA });

    // 같은 id 가 남아 있어도 내용이 달라졌다. id 만 지문에 넣으면 못 잡는다.
    const other = await preview({ card_product_id: cardB });
    await remap({ card_product_id: cardB, preview_token: other.body.preview_token });

    const r = await remap({ card_product_id: cardA, preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409);
    assert.ok(id);
  });

  test('B-5. 조건이 다르면 같은 지문을 재사용할 수 없다', async () => {
    await addTx({ payment_method_id: hanaId, date: '2026-01-10' });
    await addTx({ payment_method_id: hanaId, date: '2026-06-20' });
    const narrow = await preview({ card_product_id: cardA, from: '2026-01-01', to: '2026-03-31' });
    assert.strictEqual(narrow.body.count, 1);

    // 좁은 범위를 보여주고 전체를 옮기려는 시도.
    const r = await remap({ card_product_id: cardA, preview_token: narrow.body.preview_token });
    assert.strictEqual(r.status, 409);
  });
});

describe('C. 대량 지정', () => {
  test('C-1. 확인한 지문으로 실행하면 전부 옮겨진다', async () => {
    for (let i = 0; i < 5; i++) await addTx({ payment_method_id: hanaId });

    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.count, 5);

    const r = await remap({ card_product_id: cardA, preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.updated, 5);

    const rows = snapshot();
    assert.ok(rows.every((t) => t.card_product_id === cardA));
  });

  test('C-2. 기간으로 좁히면 그 기간만 옮겨진다', async () => {
    const inRange = await addTx({ payment_method_id: hanaId, date: '2026-02-10' });
    const outRange = await addTx({ payment_method_id: hanaId, date: '2026-09-10' });

    const p = await preview({ card_product_id: cardA, from: '2026-01-01', to: '2026-06-30' });
    assert.strictEqual(p.body.count, 1);
    await remap({ card_product_id: cardA, from: '2026-01-01', to: '2026-06-30', preview_token: p.body.preview_token });

    const rows = snapshot();
    assert.strictEqual(rows.find((t) => t.id === inRange).card_product_id, cardA);
    assert.strictEqual(rows.find((t) => t.id === outRange).card_product_id, null);
  });

  test('C-3. 가맹점으로 좁힐 수 있다', async () => {
    const target = await addTx({ payment_method_id: hanaId, merchant: '스타벅스 강남점' });
    const other = await addTx({ payment_method_id: hanaId, merchant: '한국철도공사' });

    const p = await preview({ card_product_id: cardA, merchant: '스타벅스' });
    assert.strictEqual(p.body.count, 1);
    await remap({ card_product_id: cardA, merchant: '스타벅스', preview_token: p.body.preview_token });

    const rows = snapshot();
    assert.strictEqual(rows.find((t) => t.id === target).card_product_id, cardA);
    assert.strictEqual(rows.find((t) => t.id === other).card_product_id, null);
  });

  // 금액은 부호 없이 저장된다(실측: 546건 전부 양수). 지출·수입은 카테고리의
  // 대분류가 가른다 — 화면이 음수를 넣게 안내하면 아무것도 안 걸린다.
  test('C-4. 금액대로 좁힐 수 있다', async () => {
    const small = await addTx({ payment_method_id: hanaId, amount: 3000 });
    const big = await addTx({ payment_method_id: hanaId, amount: 80000 });

    const p = await preview({ card_product_id: cardA, min_amount: 0, max_amount: 5000 });
    assert.strictEqual(p.body.count, 1);
    await remap({ card_product_id: cardA, min_amount: 0, max_amount: 5000, preview_token: p.body.preview_token });

    const rows = snapshot();
    assert.strictEqual(rows.find((t) => t.id === small).card_product_id, cardA);
    assert.strictEqual(rows.find((t) => t.id === big).card_product_id, null);
  });

  test('C-5. 다른 카드사 거래는 대상이 아니다', async () => {
    const hana = await addTx({ payment_method_id: hanaId });
    const samsung = await addTx({ payment_method_id: samsungId });

    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.count, 1);
    await remap({ card_product_id: cardA, preview_token: p.body.preview_token });

    const rows = snapshot();
    assert.strictEqual(rows.find((t) => t.id === hana).card_product_id, cardA);
    assert.strictEqual(rows.find((t) => t.id === samsung).card_product_id, null);
    assert.ok(samsungCard);
  });

  test('C-6. 카드 아닌 결제수단은 대상이 아니다', async () => {
    const cash = await addTx({ payment_method_id: cashId });
    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.count, 0);
    assert.ok(cash);
  });
});

describe('D. 이미 지정된 거래', () => {
  test('D-1. 기본값은 미상만 옮긴다 — 이미 한 판단을 조용히 덮지 않는다', async () => {
    const assigned = await addTx({ payment_method_id: hanaId, merchant: '이미지정' });
    const unassigned = await addTx({ payment_method_id: hanaId, merchant: '아직미상' });
    await assignTo(cardB, { merchant: '이미지정' });

    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.already_assigned, 0);
    await remap({ card_product_id: cardA, preview_token: p.body.preview_token });

    const rows = snapshot();
    assert.strictEqual(rows.find((t) => t.id === assigned).card_product_id, cardB);
    assert.strictEqual(rows.find((t) => t.id === unassigned).card_product_id, cardA);
  });

  test('D-2. include_assigned 면 덮어쓰고, 몇 건을 덮는지 프리뷰가 알린다', async () => {
    const assigned = await addTx({ payment_method_id: hanaId, merchant: '이미지정' });
    await addTx({ payment_method_id: hanaId, merchant: '아직미상' });
    await assignTo(cardB, { merchant: '이미지정' });

    const p = await preview({ card_product_id: cardA, include_assigned: true });
    assert.strictEqual(p.body.count, 2);
    assert.strictEqual(p.body.already_assigned, 1);

    await remap({ card_product_id: cardA, include_assigned: true, preview_token: p.body.preview_token });
    assert.strictEqual(snapshot().find((t) => t.id === assigned).card_product_id, cardA);
  });

  test('D-3. 이미 그 카드인 거래는 건수에 안 센다', async () => {
    await addTx({ payment_method_id: hanaId });
    await assignTo(cardA);

    const p = await preview({ card_product_id: cardA, include_assigned: true });
    assert.strictEqual(p.body.count, 0);
  });
});

describe('E. 프리뷰가 보여주는 것', () => {
  test('E-1. 대표 사례가 전 → 후로 온다', async () => {
    await addTx({ payment_method_id: hanaId, merchant: '스타벅스', amount: 4500 });

    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.samples.length, 1);
    assert.strictEqual(p.body.samples[0].merchant, '스타벅스');
    assert.strictEqual(p.body.samples[0].before, null);
    assert.strictEqual(p.body.samples[0].after, '하나 A카드');
  });

  test('E-2. 덮어쓰는 경우 before 에 지금 카드가 온다', async () => {
    await addTx({ payment_method_id: hanaId });
    await assignTo(cardB);

    const p = await preview({ card_product_id: cardA, include_assigned: true });
    assert.strictEqual(p.body.samples[0].before, '하나 B카드');
  });

  test('E-3. 대표 사례는 다섯 건까지만 온다 — 목록 뷰어가 아니다', async () => {
    for (let i = 0; i < 8; i++) await addTx({ payment_method_id: hanaId });
    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.count, 8);
    assert.strictEqual(p.body.samples.length, 5);
  });

  test('E-4. 되돌릴 수 있는 작업임을 알린다', async () => {
    await addTx({ payment_method_id: hanaId });
    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.undoable, true);
  });

  test('E-5. 남은 미상 건수가 실행 전후로 함께 온다', async () => {
    await addTx({ payment_method_id: hanaId });
    await addTx({ payment_method_id: hanaId });

    const p = await preview({ card_product_id: cardA });
    assert.strictEqual(p.body.remaining_unassigned, 2);

    const r = await remap({ card_product_id: cardA, preview_token: p.body.preview_token });
    assert.strictEqual(r.body.remaining_unassigned, 0);
  });

  test('E-6. 부분 완료가 정상이다 — 남은 건수로 이어서 할 수 있다', async () => {
    await addTx({ payment_method_id: hanaId, date: '2026-02-10' });
    await addTx({ payment_method_id: hanaId, date: '2026-09-10' });

    const first = await preview({ card_product_id: cardA, to: '2026-06-30' });
    const done = await remap({ card_product_id: cardA, to: '2026-06-30', preview_token: first.body.preview_token });
    assert.strictEqual(done.body.updated, 1);
    assert.strictEqual(done.body.remaining_unassigned, 1);
  });
});

describe('F. 잘못된 조건', () => {
  test('F-1. 카드를 안 고르면 400 이다', async () => {
    const r = await preview({});
    assert.strictEqual(r.status, 400);
  });

  test('F-2. 없는 카드는 400 이다', async () => {
    const r = await preview({ card_product_id: 99999 });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /카드를 찾을 수 없습니다/);
  });

  test('F-3. 형식이 틀린 날짜는 400 이다 — 조용히 0건이 되면 안 된다', async () => {
    const r = await preview({ card_product_id: cardA, from: '2026-8-1' });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /YYYY-MM-DD/);
  });

  test('F-4. 숫자가 아닌 금액은 400 이다', async () => {
    const r = await preview({ card_product_id: cardA, min_amount: 'abc' });
    assert.strictEqual(r.status, 400);
  });
});

describe('G. 실행취소', () => {
  test('G-1. 재매핑 전체가 한 작업으로 묶여 되돌아간다', async () => {
    for (let i = 0; i < 4; i++) await addTx({ payment_method_id: hanaId });

    const p = await preview({ card_product_id: cardA });
    await remap({ card_product_id: cardA, preview_token: p.body.preview_token });
    assert.ok(snapshot().every((t) => t.card_product_id === cardA));

    const undoable = await json('/api/audit/undoable');
    assert.strictEqual(undoable.body.undoable.affected, 4);

    const undone = await post('/api/audit/undo', { action_id: undoable.body.undoable.action_id });
    assert.strictEqual(undone.status, 200);

    assert.ok(snapshot().every((t) => t.card_product_id === null),
      '되돌린 뒤에는 전부 미상으로 돌아가야 한다');
  });

  test('G-2. 감사 이력에 무엇을 했는지 이름이 남는다', async () => {
    await addTx({ payment_method_id: hanaId });
    const p = await preview({ card_product_id: cardA });
    await remap({ card_product_id: cardA, preview_token: p.body.preview_token });

    const undoable = await json('/api/audit/undoable');
    assert.match(undoable.body.undoable.label, /하나 A카드/);
  });
});
