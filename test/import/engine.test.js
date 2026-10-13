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
const loadProfile = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'config/import-profiles', name), 'utf8'));

const W = 24;
const blank = () => Array(W).fill(null);
function toBuffer(rows, sheetName) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// 프로파일 엔진 == 기존 파서(코어 필드) 단언 + 반환.
function assertParity(company, profileFile, buf) {
  const oldRows = parseCardExcel(company, buf).map(pick);
  const engRows = engine.run(loadProfile(profileFile), buf).map(pick);
  assert.deepStrictEqual(engRows, oldRows, `${company} 엔진↔기존 파서 불일치`);
  return engRows;
}

test('nonghyup.usage.v1', () => {
  const rows = []; for (let i = 0; i < 14; i++) rows.push(blank());
  const mk = (d, ap, am, me, st, mo, ca) => { const r = blank(); r[1] = d; r[3] = ap; r[10] = am; r[14] = me; r[18] = st; r[21] = mo; r[22] = ca; return r; };
  rows.push(mk('2026/07/19 12:00', 11111111, 34000, '상점가', '일시불', null, '0'));
  rows.push(mk('2026/06/01 09:30', 22222222, 120000, '상점나', '할부', '3', '0'));
  rows.push(mk('2026/06/15 18:05', 33333333, '5,000', '상점다', '일시불', null, '취소'));
  const t = blank(); t[1] = '합계'; rows.push(t);
  const eng = assertParity('nonghyup', 'nonghyup.usage.v1.json', toBuffer(rows));
  assert.strictEqual(eng.length, 3);
  assert.strictEqual(eng[1].is_installment, true); assert.strictEqual(eng[1].installment_months, 3);
  assert.strictEqual(eng[2].cancelled, true);
});

test('lotte.usage.v1', () => {
  const rows = []; for (let i = 0; i < 8; i++) rows.push(blank());
  const mk = (d, me, am, st, mo, ap, ca) => { const r = blank(); r[0] = d; r[3] = me; r[5] = am; r[6] = st; r[7] = mo; r[8] = ap; r[9] = ca; return r; };
  rows.push(mk('2026.06.25', '상점가', 283823, '할부', '5', 'appr1', 'N'));
  rows.push(mk('2026.06.26', '상점나', 10000, '일시불', '-', 'appr2', 'N'));
  rows.push(mk('2026.06.27', '상점다', 5000, '일시불', '-', 'appr3', 'Y'));
  const t = blank(); t[0] = '■ 합계'; rows.push(t);
  const eng = assertParity('lotte', 'lotte.usage.v1.json', toBuffer(rows));
  assert.strictEqual(eng.length, 3);
  assert.strictEqual(eng[0].installment_months, 5);
  assert.strictEqual(eng[1].installment_months, null);
  assert.strictEqual(eng[2].cancelled, true);
});

test('samsung.usage.v1 (+offset_pair_cancel)', () => {
  const rows = [blank()]; // row0 header
  const mk = (d, me, am, st, mo, ap, ca) => { const r = blank(); r[2] = d; r[4] = me; r[5] = am; r[6] = st; r[7] = mo; r[8] = ap; r[9] = ca; return r; };
  rows.push(mk('2026.10.12', '상점가', 16200, '일시불', '0', 'appr1', '-'));
  rows.push(mk('2026.10.07', '상점나 (분할납부)', 58890, '할부', '3', 'appr2', '-'));
  // 같은 승인번호 상쇄쌍: 활성 (분할납부) + 원 일시불 → 원 일시불은 취소 처리돼야
  rows.push(mk('2026.10.04', '상점다 (분할납부)', 194800, '할부', '4', 'appr3', '-'));
  rows.push(mk('2026.10.04', '상점다', 194800, '일시불', '0', 'appr3', '-'));
  const eng = assertParity('samsung', 'samsung.usage.v1.json', toBuffer(rows, '■ 국내이용내역'));
  assert.strictEqual(eng.length, 4);
  assert.strictEqual(eng[1].installment_months, 3);
  const plain = eng.find((r) => r.merchant === '상점다');
  assert.strictEqual(plain.cancelled, true, '상쇄 원거래가 취소 처리돼야');
});

test('hana.usage.v1', () => {
  const rows = []; for (let i = 0; i < 4; i++) rows.push(blank());
  const mk = (d, ap, me, am, st, mo, ca) => { const r = blank(); r[0] = d; r[3] = ap; r[4] = me; r[5] = am; r[7] = st; r[8] = mo; r[13] = ca; return r; };
  rows.push(mk('2026.01.30', 'appr1', '상점가', 8147, '일시불', '-', null));
  rows.push(mk('2026.01.29', 'appr2', '상점나', 18500, '할부', '3', null));
  rows.push(mk('2026.01.28', 'appr3', '상점다', 5000, '일시불', '-', '취소'));
  const skip = blank(); skip[0] = '소계'; rows.push(skip); // 날짜 아님 → skip
  const eng = assertParity('hana', 'hana.usage.v1.json', toBuffer(rows));
  assert.strictEqual(eng.length, 3);
  assert.strictEqual(eng[1].is_installment, true);
  assert.strictEqual(eng[2].cancelled, true);
});

test('hyundai.statement.v1 (merchant_amount_split + usd_embed)', () => {
  const rows = []; for (let i = 0; i < 3; i++) rows.push(blank());
  const mk = (d, mamt, round) => { const r = blank(); r[0] = d; r[2] = mamt; r[3] = round; return r; };
  rows.push(mk('2026년 09월 04일', '죽향기8,000', null));
  rows.push(mk('2026년 09월 10일', '카카오 - (주)버킷플레이스1,184,360', '12/1'));
  rows.push(mk('2026년 09월 24일', 'ANTHROPIC CLAUDE,USD:22.0030,578', null));
  const skip = blank(); skip[0] = '-'; rows.push(skip); // 날짜 아님 → skip
  const eng = assertParity('hyundai', 'hyundai.statement.v1.json', toBuffer(rows));
  assert.strictEqual(eng.length, 3);
  assert.strictEqual(eng[0].merchant, '죽향기'); assert.strictEqual(eng[0].amount, 8000);
  assert.strictEqual(eng[1].installment_months, 12); assert.strictEqual(eng[1].is_installment, true);
  assert.strictEqual(eng[2].amount, 30578); // USD 임베드 뒤 KRW
});

test('배포 프로파일 전수 검증', () => {
  const { validate } = require(path.join(ROOT, 'src/services/import/profileSchema'));
  const dir = path.join(ROOT, 'config/import-profiles');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 5, '프로파일 5개 이상');
  for (const f of files) {
    const res = validate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    assert.ok(res.ok, `${f}: ${res.errors.join('; ')}`);
  }
});
