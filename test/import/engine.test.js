'use strict';

// Phase0 회귀: 설정 엔진이 기존 카드사별 파서와 "같은 정규화 결과"를 내는지.
// 실데이터는 공개 레포에 넣지 않는다 — 테스트가 합성 포맷 픽스처를 메모리에서 만든다.

const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const engine = require(path.join(ROOT, 'src/services/import/engine'));
const { parseCardExcel } = require(path.join(ROOT, 'src/services/cardExcelImport'));

const CORE = ['date', 'merchant', 'amount', 'is_installment', 'installment_months', 'cancelled', 'approval_number', 'is_overseas'];
const pick = (r) => CORE.reduce((o, k) => ((o[k] = r[k]), o), {});

function loadProfile(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config/import-profiles', name), 'utf8'));
}

// 합성 농협 "사용내역" 포맷: 0~13 프리앰블, 14행부터 데이터. 열 위치는 실제 파서가
// 읽는 인덱스(1 날짜·3 승인·10 금액·14 가맹점·18 할부·21 개월·22 취소)에 맞춘다.
function buildNonghyupBuffer() {
  const W = 23;
  const blank = () => Array(W).fill(null);
  const rows = [];
  for (let i = 0; i < 14; i++) rows.push(blank());
  const mk = (date, approval, amount, merchant, style, months, cancel) => {
    const r = blank();
    r[1] = date; r[3] = approval; r[10] = amount; r[14] = merchant;
    r[18] = style; r[21] = months; r[22] = cancel;
    return r;
  };
  rows.push(mk('2026/07/19 12:00', 11111111, 34000, '테스트상점가', '일시불', null, '0'));
  rows.push(mk('2026/06/01 09:30', 22222222, 120000, '테스트상점나', '할부', '3', '0'));
  rows.push(mk('2026/06/15 18:05', 33333333, '5,000', '테스트상점다', '일시불', null, '취소'));
  rows.push(mk('2026/06/20 20:00', 44444444, 9900, 'ANTHROPIC USD:5.50', '일시불', null, '0'));
  const term = blank(); term[1] = '합계'; rows.push(term); // 날짜 아님 → break
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xls' });
}

test('nonghyup.usage.v1 프로파일 엔진이 기존 파서와 동일 결과', () => {
  const buf = buildNonghyupBuffer();
  const oldRows = parseCardExcel('nonghyup', buf).map(pick);
  const engRows = engine.run(loadProfile('nonghyup.usage.v1.json'), buf).map(pick);
  assert.deepStrictEqual(engRows, oldRows);
  // 내용 자체도 기대대로인지(엔진 단독 검증)
  assert.strictEqual(engRows.length, 4);
  assert.strictEqual(engRows[0].amount, 34000);
  assert.strictEqual(engRows[1].is_installment, true);
  assert.strictEqual(engRows[1].installment_months, 3);
  assert.strictEqual(engRows[2].cancelled, true);
});
