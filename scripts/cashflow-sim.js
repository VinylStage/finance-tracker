'use strict';

// 현금흐름 시뮬 CLI — 실 DB 의 할부·반복 + 보유현금 앵커 + (옵션)휴대폰 할부 가정으로
// 월별 유출·잔액·첫 적자월·조절전략을 출력한다(스펙 B, UI 전 단계).
//
// 사용:
//   node scripts/cashflow-sim.js --cash 2000000 --asof 2026-10-13 --income 0 \
//        --phone 1500000 --phone-months 24 --phone-start 2026-11 --horizon 12
//   (--cash 생략 시 cash_anchors 의 기준일 이전 최근 앵커 사용)

const path = require('path');
const { projectCashflow } = require('../src/services/advisor/projection');
const { loadProjectionInputs, latestAnchor } = require('../src/services/advisor/dbAdapter');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const fmt = (n) => Number(n).toLocaleString();

function main() {
  const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
  const dbPath = arg('db', path.join(__dirname, '..', 'data', 'finance.db'));
  const db = new Database(dbPath, { readonly: true });

  const asOf = arg('asof', new Date().toISOString().slice(0, 10));
  const asOfMonth = asOf.slice(0, 7);
  const income = Number(arg('income', '0'));
  const horizon = Number(arg('horizon', '12'));

  let cash = arg('cash', null);
  if (cash == null) {
    const a = latestAnchor(db, asOf);
    if (!a) { console.error('보유현금(--cash) 또는 cash_anchors 앵커가 필요합니다.'); process.exit(1); }
    cash = a.amount;
  }
  cash = Number(cash);

  const { installments, recurring } = loadProjectionInputs(db, { asOfMonth });

  const simulated = [];
  const phone = arg('phone', null);
  if (phone) {
    const months = Number(arg('phone-months', '24'));
    simulated.push({ kind: 'installment', monthlyAmount: Math.round(Number(phone) / months), startMonth: arg('phone-start', asOfMonth), months, label: '휴대폰' });
  }

  const base = projectCashflow({ anchor: { month: asOfMonth, amount: cash }, horizonMonths: horizon, monthlyIncome: income, recurring, installments, simulated: [] });
  const withSim = projectCashflow({ anchor: { month: asOfMonth, amount: cash }, horizonMonths: horizon, monthlyIncome: income, recurring, installments, simulated });

  console.log(`기준: ${asOfMonth} 보유현금 ${fmt(cash)} / 월유입 ${fmt(income)} / 할부 ${installments.length}건 / 반복 ${recurring.length}건`);
  console.log('월       | 유출(기본) | 잔액(기본) | 유출(+시뮬) | 잔액(+시뮬)');
  base.timeline.forEach((t, i) => {
    const s = withSim.timeline[i];
    console.log(`${t.month} | ${fmt(t.outflow).padStart(9)} | ${fmt(t.balance).padStart(10)} | ${fmt(s.outflow).padStart(9)} | ${fmt(s.balance).padStart(10)}`);
  });
  console.log(`\n기본   첫적자 ${base.firstNegativeMonth || '없음'} / 최소잔액 ${fmt(base.minBalance)}`);
  if (phone) console.log(`+시뮬  첫적자 ${withSim.firstNegativeMonth || '없음'} / 최소잔액 ${fmt(withSim.minBalance)}`);
}

if (require.main === module) main();
module.exports = { main };
