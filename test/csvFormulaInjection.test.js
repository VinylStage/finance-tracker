'use strict';

// CSV 수식 인젝션 방어(#460, CWE-1236).
//
// 잠그는 것이 셋이다.
//
//   1. 내보낸 CSV 가 `= + - @` 로 시작하는 값을 수식으로 열리게 두지 않는다
//   2. 그렇게 붙인 접두사를 **다시 들여올 때 벗긴다** — 왕복이 무손실이어야 한다
//   3. JSON 백업은 건드리지 않는다 — 거기는 스프레드시트가 안 연다
//
// 1 만 검사하면 값이 한 글자씩 늘어난 채 저장되는 것을 못 잡고, 2 만 검사하면
// 멀쩡한 값이 깎이는 것을 못 잡는다.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const { guardFormula, unguardFormula, FORMULA_LEAD } = require('../src/utils/csvFormulaGuard');
const { parseCardCsv } = require('../src/services/csvImport');

const PORT = 34701;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

describe('접두사 붙이기·벗기기', () => {
  // 이슈 #460 이 실행해 확인한 네 가지 그대로다.
  const PAYLOADS = ['=1+1', '+1+1', '-1+1', '@SUM(A1)'];

  for (const payload of PAYLOADS) {
    test(`${payload} 는 어포스트로피가 붙는다`, () => {
      assert.strictEqual(guardFormula(payload), `'${payload}`);
    });

    test(`${payload} 는 벗기면 원래대로다`, () => {
      assert.strictEqual(unguardFormula(guardFormula(payload)), payload);
    });
  }

  test('수식 시작 문자를 빠짐없이 다룬다', () => {
    assert.deepStrictEqual(FORMULA_LEAD, ['=', '+', '-', '@']);
  });

  test('평범한 값은 그대로 둔다', () => {
    for (const v of ['이마트', 'Starbucks', '1+1', '스타벅스 =강남점']) {
      assert.strictEqual(guardFormula(v), v, `붙으면 안 된다: ${v}`);
      assert.strictEqual(unguardFormula(v), v, `벗기면 안 된다: ${v}`);
    }
  });

  // 조건 없이 선행 `'` 를 벗기면 이런 값이 매번 한 글자씩 깎인다.
  test("어포스트로피로 시작하는 멀쩡한 값은 깎지 않는다", () => {
    for (const v of ["'안녕", "'quoted'", "'"]) {
      assert.strictEqual(unguardFormula(v), v, `깎이면 안 된다: ${v}`);
    }
  });

  // 값이 수식 문자 한 글자뿐인 경우. 붙이면 두 글자가 되는데, 길이 조건을
  // 하나만 잘못 잡아도(`< 2` 를 `< 3` 으로) 이 값만 조용히 안 벗겨진다.
  test('한 글자짜리 수식 값도 왕복한다', () => {
    for (const v of FORMULA_LEAD) {
      assert.strictEqual(guardFormula(v), `'${v}`);
      assert.strictEqual(unguardFormula(`'${v}`), v, `안 벗겨졌다: '${v}`);
    }
  });

  test('빈 값과 비문자열은 그대로 통과한다', () => {
    assert.strictEqual(guardFormula(''), '');
    assert.strictEqual(unguardFormula(''), '');
    assert.strictEqual(guardFormula(null), null);
    assert.strictEqual(unguardFormula(undefined), undefined);
    assert.strictEqual(guardFormula(42), 42);
  });
});

describe('내보내기', () => {
  async function seed(merchant, memo = '') {
    const cat = await fetch(`${BASE}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `수식테스트-${Date.now()}-${Math.round(performance.now())}`, major_type: '선택지출' }),
    });
    const { id: categoryId } = await cat.json();
    const r = await fetch(`${BASE}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-03-03', merchant, memo, amount: 1000,
        payment_style: '일시불', category_id: categoryId,
      }),
    });
    assert.strictEqual(r.status, 201, await r.text());
  }

  test('가맹점명이 수식으로 시작하면 어포스트로피를 붙여 내보낸다', async () => {
    await seed('=HYPERLINK("http://x","click")');
    const csv = await (await fetch(`${BASE}/api/export/csv`)).text();

    // 감싸기가 필요한 값이라 따옴표 안에 들어간다. 어포스트로피는 **따옴표
    // 안쪽**에 있어야 한다 — 바깥에 있으면 열이 어긋난다.
    assert.ok(
      csv.includes(`"'=HYPERLINK(""http://x"",""click"")"`),
      `방어가 안 걸렸다:\n${csv}`
    );
    assert.ok(!/,=HYPERLINK/.test(csv), '수식이 그대로 나갔다');
  });

  test('쉼표가 든 수식도 열이 어긋나지 않는다', async () => {
    await seed('=1+1,이마트');
    const csv = await (await fetch(`${BASE}/api/export/csv`)).text();
    assert.ok(csv.includes(`"'=1+1,이마트"`), `감싸기 순서가 틀렸다:\n${csv}`);
  });

  test('메모도 같이 막는다', async () => {
    await seed('평범한가게', '@SUM(1)');
    const csv = await (await fetch(`${BASE}/api/export/csv`)).text();
    assert.ok(csv.includes("'@SUM(1)"), `메모가 안 막혔다:\n${csv}`);
  });

  // 스프레드시트가 열지 않는 형식이라 값을 바꾸지 않는다. 여기에 접두사가
  // 붙으면 **복원할 때마다 가맹점명이 한 글자씩 길어진다.**
  test('JSON 백업에는 접두사가 붙지 않는다', async () => {
    await seed('=json그대로');
    const body = await (await fetch(`${BASE}/api/export/json`)).json();
    const found = body.transactions.find((t) => t.merchant.includes('json그대로'));
    assert.ok(found, 'JSON 백업에 거래가 없다');
    assert.strictEqual(found.merchant, '=json그대로');
  });
});

describe('다시 들여오기', () => {
  // 내보낸 값이 카드사 임포트를 거쳐 돌아와도 원래 문자열이어야 한다.
  test('접두사가 붙은 가맹점명을 벗겨서 읽는다', () => {
    const guarded = guardFormula('=이마트');
    const csv = `거래일자,가맹점,금액\n2026-03-03,${guarded},1000\n`;
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].merchant, '=이마트');
  });

  test('카드사가 준 평범한 파일은 그대로 읽는다', () => {
    const csv = '거래일자,가맹점,금액\n2026-03-03,이마트 성수점,1000\n';
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows[0].merchant, '이마트 성수점');
  });

  // 어포스트로피로 시작하는 진짜 가맹점명이 깎이면 안 된다.
  test("어포스트로피로 시작하는 가맹점명을 깎지 않는다", () => {
    const csv = "거래일자,가맹점,금액\n2026-03-03,'t Zusje,1000\n";
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows[0].merchant, "'t Zusje");
  });
});
