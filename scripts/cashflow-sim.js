'use strict';

// 현금흐름 시뮬 CLI — 실 DB 의 할부·반복 + 보유현금 앵커 + (옵션)추가 지출 가정으로
// 월별 유출·잔액·첫 적자월을 출력한다(스펙 B, UI 전 단계). 웹 대시보드와 같은
// 일별 엔진(loadBaselineInputs + cycleHeadroom)을 쓴다 — 두 경로의 숫자가 어긋나지
// 않게(감사 H1/H2 통합). 과거 거래는 건드리지 않는다(읽기 전용).
//
// 사용:
//   node scripts/cashflow-sim.js --asof 2026-10-13 --horizon 12 \
//        --sim 1500000 --sim-months 24 --sim-start 2026-11 --label 노트북
//   (보유현금은 cash_anchors 의 기준일 이전 최근 앵커를 쓴다. --cash 로 금액만 덮어쓸 수 있다.)
//   (--unpaid 삼성카드,현대카드  로 미결제 카드의 앵커 이전 사용분을 예정 청구로 반영.)

const path = require('path');
const { cycleHeadroom } = require('../src/services/advisor/headroom');
const {
  loadBaselineInputs, latestAnchorRow, monthAddYM, monthsToTimeline, simToScheduled,
} = require('../src/services/advisor/headroomInputs');

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
  const horizon = Number(arg('horizon', '12'));
  const unpaidCards = String(arg('unpaid', '')).split(',').map((s) => s.trim()).filter(Boolean);

  const anchorRow = latestAnchorRow(db, asOf);
  if (!anchorRow) { console.error('보유현금 앵커(cash_anchors)가 없습니다. 먼저 기준일 보유현금을 입력하세요.'); process.exit(1); }
  const anchorMonth = anchorRow.as_of_date.slice(0, 7);
  const through = monthAddYM(anchorMonth, horizon - 1);

  const simulated = [];
  const sim = arg('sim', null);
  if (sim) {
    const months = Number(arg('sim-months', '1'));
    simulated.push({
      kind: 'installment', monthlyAmount: Math.round(Number(sim) / months),
      startMonth: arg('sim-start', anchorMonth), months, label: arg('label', '추가 지출'),
    });
  }

  const baseInp = loadBaselineInputs(db, { asOf, through, unpaidCards });
  const cashOverride = arg('cash', null);
  if (cashOverride != null) baseInp.anchorAmount = Number(cashOverride);
  const cash = baseInp.anchorAmount;
  const base = monthsToTimeline(cycleHeadroom(baseInp).months);

  let withSim = null;
  if (simulated.length) {
    const inp = loadBaselineInputs(db, { asOf, through, unpaidCards });
    if (cashOverride != null) inp.anchorAmount = Number(cashOverride);
    inp.scheduled = [...inp.scheduled, ...simToScheduled(simulated)];
    withSim = monthsToTimeline(cycleHeadroom(inp).months);
  }

  console.log(`기준: ${anchorRow.as_of_date} 보유현금 ${fmt(cash)} / horizon ${horizon}개월 / 미결제카드 ${unpaidCards.length ? unpaidCards.join(',') : '없음'}`);
  if (withSim) {
    console.log('월       |  유출(기본) |  잔액(기본) | 유출(+시뮬) | 잔액(+시뮬)');
    base.timeline.forEach((t, i) => {
      const s = withSim.timeline[i];
      console.log(`${t.month} | ${fmt(t.outflow).padStart(10)} | ${fmt(t.balance).padStart(10)} | ${fmt(s.outflow).padStart(9)} | ${fmt(s.balance).padStart(10)}`);
    });
  } else {
    console.log('월       |  유출 |  잔액');
    base.timeline.forEach((t) => console.log(`${t.month} | ${fmt(t.outflow).padStart(10)} | ${fmt(t.balance).padStart(10)}`));
  }
  console.log(`\n기본   첫적자 ${base.firstNegativeMonth || '없음'} / 최소월말잔액 ${fmt(base.minBalance)}`);
  if (withSim) console.log(`+시뮬  첫적자 ${withSim.firstNegativeMonth || '없음'} / 최소월말잔액 ${fmt(withSim.minBalance)}`);
}

if (require.main === module) main();
module.exports = { main };
