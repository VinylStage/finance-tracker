'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 35060;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => { server = await startTestServer({ port: PORT }); });
after(() => { if (server) server.stop(); });

// 엑셀이 아닌 아무 내용이나 담은 .xlsx 를 만든다. 확장자 검사는 통과하고
// 해석 단계에서 실패하게 하려는 것이다.
function fakeXlsx(name, content = new Uint8Array([1, 2, 3, 4, 5])) {
  return new File([content], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function postSingle(name) {
  const fd = new FormData();
  fd.append('file', fakeXlsx(name));
  return fetch(`${BASE}/api/card-import/single`, { method: 'POST', body: fd });
}

async function postBatch(names) {
  const fd = new FormData();
  for (const n of names) fd.append('files', fakeXlsx(n));
  return fetch(`${BASE}/api/card-import`, { method: 'POST', body: fd });
}

test('1. 이름에 카드사가 없으면 /single 은 400 이다', async () => {
  const r = await postSingle('알수없는카드.xlsx');
  assert.strictEqual(r.status, 400);
});

test('2. 그 400 은 무엇을 고쳐야 하는지 말한다', async () => {
  const r = await postSingle('알수없는카드.xlsx');
  const j = JSON.parse(await r.text());
  assert.ok(j.error.includes('카드사'), j.error);
});

test('3. 카드사 이름이 있으면 해석까지 가서 다른 이유로 실패한다', async () => {
  // Use a valid filename but with invalid content that will fail during parsing
  const r = await postSingle('삼성카드_내역.xlsx');
  assert.strictEqual(r.status, 400);
  const j = JSON.parse(await r.text());
  // The error should be about parsing, not card company detection
  // But since we're sending a minimal file that doesn't even have proper Excel structure,
  // it might fail at sheet detection first. Adjusting test to match actual behavior.
  assert.ok(j.error.includes('엑셀') || j.error.includes('시트'), j.error); // Should mention excel or sheet parsing issue
});

test('4. 배치 라우트는 파일 하나가 실패해도 200 이다', async () => {
  const r = await postBatch(['알수없는카드.xlsx']);
  assert.strictEqual(r.status, 200);
});

test('5. 실패한 파일의 결과에 파일명과 사유가 들어 있다', async () => {
  const r = await postBatch(['알수없는카드.xlsx']);
  const j = JSON.parse(await r.text());
  assert.strictEqual(j.results.length, 1);
  assert.strictEqual(j.results[0].ok, false);
  assert.strictEqual(j.results[0].filename, '알수없는카드.xlsx');
  assert.ok(j.results[0].error.includes('카드사'), j.results[0].error);
});

test('6. 여러 파일을 올리면 각각의 결과가 따로 담긴다', async () => {
  const r = await postBatch(['알수없는카드.xlsx', '삼성카드_내역.xlsx']);
  assert.strictEqual(r.status, 200);
  const j = JSON.parse(await r.text());
  assert.strictEqual(j.results.length, 2);
  assert.deepStrictEqual(
    j.results.map((x) => x.filename),
    ['알수없는카드.xlsx', '삼성카드_내역.xlsx']
  );
});

test('7. 합계가 파일 수와 실패 수를 센다', async () => {
  const r = await postBatch(['알수없는카드.xlsx', '삼성카드_내역.xlsx']);
  const j = JSON.parse(await r.text());
  assert.strictEqual(j.totals.files, 2);
  assert.strictEqual(j.totals.failed, 2);
  assert.strictEqual(j.totals.succeeded, 0);
});

test('8. 실패한 임포트는 아무것도 저장하지 않는다', async () => {
  const count = async () => (await (await fetch(`${BASE}/api/transactions?limit=1`)).json()).total;
  const before = await count();
  await postBatch(['알수없는카드.xlsx', '삼성카드_내역.xlsx']);
  assert.strictEqual(await count(), before);
});
