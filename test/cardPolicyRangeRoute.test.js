'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const { expandRange, validateRange } = require('../src/services/cardPolicy');

// #271 의 저장 경로. 화면은 구간으로 받고 저장은 개월수별 행이므로, 펼치기가
// 맞는지와 "중간에 막히면 앞부분만 들어가는" 반쪽 상태가 없는지가 핵심이다.

const PORT = 34606; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

async function cardId() {
  const { body } = await json('/api/payment-methods');
  return (body.data || body).find((p) => p.name === '신용카드').id;
}

describe('A. 구간 펼치기 (순수 함수)', () => {
  test('A-1. 2~4개월이 3개 행으로 펼쳐진다', () => {
    const rows = expandRange({
      payment_method_id: 1, from_month: 2, to_month: 4,
      policy_type: '무이자', effective_from: '2026-01-01',
    });
    assert.deepStrictEqual(rows.map((r) => r.months), [2, 3, 4]);
    assert.ok(rows.every((r) => r.policy_type === '무이자'));
    assert.ok(rows.every((r) => r.annual_rate === 0 && r.free_from_sequence === 0));
  });

  test('A-2. 한 달짜리 구간도 된다', () => {
    const rows = expandRange({
      payment_method_id: 1, from_month: 6, to_month: 6,
      policy_type: '유이자', annual_rate: 15.9, effective_from: '2026-01-01',
    });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].annual_rate, 15.9);
  });

  test('A-3. 빈 문자열은 0 으로 본다 — 감춘 입력이 그대로 넘어와도 깨지지 않는다', () => {
    const rows = expandRange({
      payment_method_id: 1, from_month: 2, to_month: 2,
      policy_type: '무이자', annual_rate: '', free_from_sequence: '', effective_from: '2026-01-01',
    });
    assert.strictEqual(rows[0].annual_rate, 0);
    assert.strictEqual(rows[0].free_from_sequence, 0);
  });
});

describe('B. 구간 검증', () => {
  const cases = [
    { name: '2개월 미만 거부', input: { from_month: 1, to_month: 3 }, fails: true },
    { name: '역순 구간 거부', input: { from_month: 6, to_month: 3 }, fails: true },
    { name: '60개월 초과 거부', input: { from_month: 2, to_month: 61 }, fails: true },
    { name: '정상 구간 통과', input: { from_month: 2, to_month: 12 }, fails: false },
    {
      name: '면제 시작 회차가 구간 시작 개월수보다 뒤면 거부',
      // 4회차부터 면제인데 3개월 할부에는 4회차가 없다.
      input: { from_month: 3, to_month: 12, policy_type: '부분무이자', free_from_sequence: 4 },
      fails: true,
    },
    {
      name: '면제 시작 회차가 구간 안에 들어오면 통과',
      input: { from_month: 4, to_month: 12, policy_type: '부분무이자', free_from_sequence: 4 },
      fails: false,
    },
  ];

  for (const c of cases) {
    test(`B. ${c.name}`, () => {
      const result = validateRange(c.input);
      if (c.fails) {
        assert.ok(result, '거부돼야 하는데 통과했다');
        // 사용자에게 그대로 보이는 문구다. 내부 필드명이 있으면 안 된다(#231).
        for (const bad of ['from_month', 'to_month', 'free_from_sequence', 'policy_type']) {
          assert.ok(!result.includes(bad), `문구에 내부 필드명 노출: ${result}`);
        }
      } else {
        assert.strictEqual(result, null);
      }
    });
  }
});

describe('C. 저장', () => {
  test('C-1. 구간 하나가 개월수별 행으로 저장된다', async () => {
    const id = await cardId();
    const res = await json('/api/card-policies/range', {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: id, from_month: 2, to_month: 3,
        policy_type: '무이자', effective_from: '2026-01-01', effective_to: '2026-12-31',
      }),
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.created, 2);

    const list = await json(`/api/card-policies?payment_method_id=${id}`);
    assert.deepStrictEqual(list.body.data.map((p) => p.months).sort((a, b) => a - b), [2, 3]);
  });

  test('C-2. 겹치면 409 이고 아무것도 저장되지 않는다', async () => {
    const id = await cardId();
    const before = await json(`/api/card-policies?payment_method_id=${id}`);

    // 2~3 은 C-1 이 이미 잡았다. 2~6 을 넣으면 앞 두 개월이 겹친다.
    const res = await json('/api/card-policies/range', {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: id, from_month: 2, to_month: 6,
        policy_type: '유이자', annual_rate: 15.9, effective_from: '2026-06-01',
      }),
    });
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.ok(/2, 3개월/.test(res.body.error), `어느 개월이 걸렸는지 안 알려준다: ${res.body.error}`);

    const after = await json(`/api/card-policies?payment_method_id=${id}`);
    assert.strictEqual(after.body.data.length, before.body.data.length,
      '겹치는 구간의 일부만 저장됐다 — 반쪽 상태가 남았다');
  });

  test('C-3. 겹치지 않는 구간은 이어서 저장된다', async () => {
    const id = await cardId();
    const res = await json('/api/card-policies/range', {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: id, from_month: 4, to_month: 6,
        policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 3,
        effective_from: '2026-01-01', effective_to: '2026-12-31',
      }),
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.created, 3);
  });

  test('C-4. 종류와 값이 어긋나면 400', async () => {
    const id = await cardId();
    const res = await json('/api/card-policies/range', {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: id, from_month: 20, to_month: 22,
        policy_type: '무이자', annual_rate: 15.9, effective_from: '2026-01-01',
      }),
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('무이자'));
  });

  test('C-5. 필수값이 빠지면 400', async () => {
    const id = await cardId();
    const res = await json('/api/card-policies/range', {
      method: 'POST',
      body: JSON.stringify({ payment_method_id: id, from_month: 2, to_month: 3 }),
    });
    assert.strictEqual(res.status, 400);
  });
});

describe('D. 구간 삭제', () => {
  test('D-1. 구간째 지워진다', async () => {
    const id = await cardId();
    const del = await json(
      `/api/card-policies/range?payment_method_id=${id}&from_month=4&to_month=6&effective_from=2026-01-01`,
      { method: 'DELETE' }
    );
    assert.strictEqual(del.status, 200);
    assert.strictEqual(del.body.deleted, 3);

    const list = await json(`/api/card-policies?payment_method_id=${id}`);
    assert.deepStrictEqual(list.body.data.map((p) => p.months).sort((a, b) => a - b), [2, 3]);
  });

  test('D-2. 다른 적용 기간의 정책은 남는다', async () => {
    const id = await cardId();
    await json('/api/card-policies/range', {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: id, from_month: 2, to_month: 3,
        policy_type: '유이자', annual_rate: 12, effective_from: '2027-01-01',
      }),
    });
    const del = await json(
      `/api/card-policies/range?payment_method_id=${id}&from_month=2&to_month=3&effective_from=2027-01-01`,
      { method: 'DELETE' }
    );
    assert.strictEqual(del.body.deleted, 2);

    const list = await json(`/api/card-policies?payment_method_id=${id}`);
    assert.ok(list.body.data.every((p) => p.effective_from === '2026-01-01'));
  });

  test('D-3. 삭제 경로가 :id 라우트에 먹히지 않는다', async () => {
    // '/range' 를 '/:id' 뒤에 선언하면 range 가 id 로 잡혀 조용히 404 가 된다.
    const id = await cardId();
    const res = await json(
      `/api/card-policies/range?payment_method_id=${id}&from_month=99&to_month=99&effective_from=2026-01-01`,
      { method: 'DELETE' }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deleted, 0);
  });
});
