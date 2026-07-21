'use strict';
const XLSX = require('xlsx');
const path = require('path');
const db = require('../src/db/init');

const XLSX_PATH = path.join(__dirname, '../ref/tracker_v5.xlsx');
const wb = XLSX.readFile(XLSX_PATH);

// ── 1. 결제수단 시드
const PM_TYPES = {
  '하나카드': '신용', '삼성카드': '신용', '현대카드': '신용',
  '신한카드': '신용', '롯데카드': '신용', '농협카드': '신용',
  '현금성 결제': '현금성', '현금': '현금성',
  '자동이체': '이체', '계좌이체': '이체',
};
const insertPM = db.prepare('INSERT OR IGNORE INTO payment_methods (name, type) VALUES (?,?)');
for (const [name, type] of Object.entries(PM_TYPES)) insertPM.run(name, type);
console.log('[migrate] payment_methods seeded');

// ── 2. 카테고리 + 예산 시드 (설정 시트)
const ws설정 = wb.Sheets['설정'];
const settingsRows = XLSX.utils.sheet_to_json(ws설정, { header: 1, defval: '' });

const TYPE_MAP = { '수입': '수입', '고정지출': '고정지출', '변동필수': '변동필수', '부채상환': '부채상환', '선택지출': '선택지출', '저축': '저축' };
const insertCat = db.prepare('INSERT OR IGNORE INTO categories (major_type, name, monthly_budget) VALUES (?,?,?)');

let catCount = 0;
for (const row of settingsRows) {
  const name = String(row[0] || '').trim();
  const budget = Number(row[1]) || 0;
  const type = TYPE_MAP[String(row[2] || '').trim()];
  if (name && type) {
    insertCat.run(type, name, budget);
    catCount++;
  }
}
console.log(`[migrate] categories seeded: ${catCount}`);

// ── 3. 거래 마이그레이션 (거래입력 시트, 헤더 row5, 데이터 row6~)
const ws거래 = wb.Sheets['거래입력'];
const txRows = XLSX.utils.sheet_to_json(ws거래, { header: 1, range: 4, defval: '' });

// 캐시 빌드
const pmCache = {};
for (const pm of db.prepare('SELECT * FROM payment_methods').all()) pmCache[pm.name] = pm.id;
const catCache = {};
for (const c of db.prepare('SELECT * FROM categories').all()) catCache[c.name] = c.id;

const insertTx = db.prepare(`
  INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, memo)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let txCount = 0;
let skipped = 0;
const insertMany = db.transaction(() => {
  for (const row of txRows) {
    const date = String(row[0] || '').trim();
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue; // skip non-data rows

    const majorType = String(row[1] || '').trim();
    const catName   = String(row[2] || '').trim();
    const amount    = Number(row[3]) || 0;
    const pmName    = String(row[4] || '').trim();
    const style     = String(row[5] || '일시불').trim();
    const merchant  = String(row[6] || '').trim() || null;
    const memo      = String(row[7] || '').trim() || null;

    const category_id = catCache[catName];
    if (!category_id) {
      console.warn(`[skip] 카테고리 없음: "${catName}" (${date})`);
      skipped++;
      continue;
    }
    const pm_id = pmCache[pmName] || null;
    insertTx.run(date, category_id, amount, pm_id, style, merchant, memo);
    txCount++;
  }
});
insertMany();

console.log(`[migrate] transactions: ${txCount} inserted, ${skipped} skipped`);
const count = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get().cnt;
console.log(`[migrate] DB total: ${count} transactions`);
if (count !== 219) console.warn(`[WARN] 예상 219건, 실제 ${count}건`);
else console.log('[migrate] ✓ 219건 검증 완료');
