'use strict';

// 신한 export(.xlsx 카드이용내역 = usage_history) 프로파일.
// 기존 파서가 없던 신규 포맷 → 합성 픽스처로 기대 정규화 결과를 단언한다.
// 실데이터는 공개 레포에 넣지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const engine = require(path.join(ROOT, 'src/services/import/engine'));
const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/import-profiles/shinhan.export.v1.json'), 'utf8'));

function toBuffer(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '카드이용내역');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('shinhan.export.v1 정규화', () => {
  const rows = [
    ['거래일', '카드구분', '이용카드', '가맹점명', '업종', '승인번호', '금액', '매입구분', '이용구분', '거래통화'],
    ['2026.10.08 05:00', '신용', '본인824*', 'APPLE', '', '43783738', 5000, '결제확정', '일시불', ''],
    ['2026.09.20 12:00', '신용', '본인824*', '상점나', '', '00123456', 120000, '결제확정', '할부', ''],
    ['2026.09.10 09:00', '신용', '본인824*', '상점다', '', '99887766', 5000, '매입취소', '일시불', ''],
  ];
  const out = engine.run(profile, toBuffer(rows));
  assert.strictEqual(out.length, 3);
  assert.deepStrictEqual(
    { date: out[0].date, merchant: out[0].merchant, approval_number: out[0].approval_number, amount: out[0].amount, is_installment: out[0].is_installment, cancelled: out[0].cancelled },
    { date: '2026-10-08', merchant: 'APPLE', approval_number: '43783738', amount: 5000, is_installment: false, cancelled: false }
  );
  assert.strictEqual(out[1].is_installment, true);
  assert.strictEqual(out[1].approval_number, '00123456', '승인번호 leading zero 보존');
  assert.strictEqual(out[2].cancelled, true, '매입취소 → cancelled');
  assert.strictEqual(out[0].source_type, 'usage_history');
});
