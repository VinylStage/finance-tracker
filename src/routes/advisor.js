'use strict';

// 재무상담/지출전략 어드바이저 API (스펙 B).
//
//   GET  /api/advisor/projection  장기 월별 현금흐름 전망(보유현금 앵커 기준)
//   GET  /api/advisor/headroom    이번 청구주기 여윳돈(다음 결제일까지 일 단위)
//   GET  /api/advisor/anchor      기준일 이전 최근 보유현금 앵커
//   POST /api/advisor/anchor      보유현금 앵커 입력(현재시점 리셋)
//
// 계산은 순수 엔진(headroom)과 DB 어댑터(headroomInputs)가 하고, 이 라우트는 입력
// 검증·조립만 한다. 전망·여윳돈 모두 같은 일별 엔진을 쓴다(숫자 일치, 감사 H1/H2).
// 거래 원장은 건드리지 않는다 — 쓰기는 cash_anchors 한 테이블뿐이다.

const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYMD } = require('../utils/date');
const { cycleHeadroom } = require('../services/advisor/headroom');
const {
  loadHeadroomInputs, loadBaselineInputs, latestAnchorRow, monthAddYM, monthsToTimeline, simToScheduled,
} = require('../services/advisor/headroomInputs');
const { netWorthTimeline } = require('../services/advisor/netWorth');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;
const isDate = (v) => YMD.test(v) && !Number.isNaN(new Date(v).getTime());

function intParam(raw, { min, max, def }) {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return NaN;
  return n;
}

// GET /api/advisor/projection?asOf=&horizon=&unpaid=&simAmount=&simMonths=&simStart=&simLabel=
//
// 장기 월별 전망. 계산은 '이번 주기 여윳돈' 과 같은 일별 엔진(loadBaselineInputs +
// cycleHeadroom)을 써 월로 집계한다 — 두 화면의 숫자가 어긋나지 않게(감사 H1/H2
// 통합). 기본은 추가 지출 없는 순수 베이스라인. simAmount 가 있을 때만 withSim 을 낸다.
router.get('/projection', (req, res) => {
  try {
    const asOf = req.query.asOf || localYMD();
    if (!isDate(asOf)) return res.status(400).json({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다.' });
    const horizon = intParam(req.query.horizon, { min: 1, max: 120, def: 24 });
    if (Number.isNaN(horizon)) return res.status(400).json({ error: 'horizon 은 1~120 개월 정수입니다.' });

    const anchorRow = latestAnchorRow(db, asOf);
    if (!anchorRow) return res.status(409).json({ error: '보유현금 앵커가 없습니다. 먼저 기준일 보유현금을 입력해 주세요.' });
    const anchor = { month: anchorRow.as_of_date.slice(0, 7), amount: anchorRow.amount };

    // 범용 what-if: 추가 지출 시나리오(할부). 이름은 사용자가 준다(특정 용도 고정 아님).
    const simulated = [];
    if (req.query.simAmount !== undefined && req.query.simAmount !== '') {
      const amount = intParam(req.query.simAmount, { min: 1, max: 100000000, def: null });
      const months = intParam(req.query.simMonths, { min: 1, max: 120, def: 1 });
      const start = req.query.simStart || anchor.month;
      const label = (req.query.simLabel ? String(req.query.simLabel).slice(0, 40) : '추가 지출');
      if (Number.isNaN(amount) || Number.isNaN(months) || !YM.test(start)) {
        return res.status(400).json({ error: '추가 지출 시나리오는 simAmount(원)·simMonths(1~120)·simStart(YYYY-MM) 로 주세요.' });
      }
      simulated.push({ kind: 'installment', monthlyAmount: Math.round(amount / months), startMonth: start, months, label });
    }

    // 미결제 카드(여윳돈과 같은 의미): 지정 시 그 카드의 앵커 이전 사용분을 예정
    // 청구로 반영. 기본은 비움(검증된 베이스라인과 동일).
    const unpaidCards = String(req.query.unpaid || '').split(',').map((s) => s.trim()).filter(Boolean);
    const through = monthAddYM(anchor.month, horizon - 1);

    const base = monthsToTimeline(cycleHeadroom(loadBaselineInputs(db, { asOf, through, unpaidCards })).months);
    let withSim = null;
    if (simulated.length) {
      const inp = loadBaselineInputs(db, { asOf, through, unpaidCards });
      inp.scheduled = [...inp.scheduled, ...simToScheduled(simulated)];
      withSim = monthsToTimeline(cycleHeadroom(inp).months);
    }
    // 순자산 축(#770): 현금흐름은 그대로 두고 적금누적·부채를 따로 얹는다.
    const debts = db.prepare('SELECT balance FROM debts').all();
    const savings = db.prepare('SELECT monthly_contribution, start_date, maturity_date, status FROM savings_products').all();
    const netWorth = { timeline: netWorthTimeline(base.timeline, { debts, savings }) };
    res.json({ anchor, horizon, simulated, base, withSim, netWorth });
  } catch (e) {
    serverError(res, e, 'advisor.projection');
  }
});

// GET /api/advisor/headroom?asOf=&unpaid=삼성카드,현대카드&spendDate=&target=
router.get('/headroom', (req, res) => {
  try {
    const asOf = req.query.asOf || localYMD();
    if (!isDate(asOf)) return res.status(400).json({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다.' });
    for (const k of ['spendDate', 'target']) {
      if (req.query[k] && !isDate(req.query[k])) return res.status(400).json({ error: `${k} 는 YYYY-MM-DD 형식이어야 합니다.` });
    }
    const unpaidCards = String(req.query.unpaid || '').split(',').map((s) => s.trim()).filter(Boolean);
    const inp = loadHeadroomInputs(db, { asOf, unpaidCards, spendDate: req.query.spendDate, target: req.query.target });
    if (inp.error) return res.status(409).json({ error: inp.error });
    if (!inp.spendDate) return res.status(409).json({ error: '카드 결제일/마감일이 설정된 카드가 없어 청구일을 정할 수 없습니다.' });
    const r = cycleHeadroom(inp);
    res.json({
      asOf: inp.asOf, anchorAmount: inp.anchorAmount, spendDate: inp.spendDate, target: inp.target,
      unpaidCards, scheduled: inp.scheduled, warnings: inp.warnings,
      capacity: r.capacity, capacityImmediate: r.capacityImmediate,
      minBefore: r.minBefore, minAfter: r.minAfter, minDate: r.minDate, timeline: r.timeline,
    });
  } catch (e) {
    serverError(res, e, 'advisor.headroom');
  }
});

router.get('/anchor', (req, res) => {
  try {
    const asOf = req.query.asOf || localYMD();
    if (!isDate(asOf)) return res.status(400).json({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다.' });
    const row = db.prepare('SELECT id, as_of_date, amount, memo FROM cash_anchors WHERE as_of_date <= ? ORDER BY as_of_date DESC, id DESC LIMIT 1').get(asOf);
    res.json(row || null);
  } catch (e) {
    serverError(res, e, 'advisor.anchor.get');
  }
});

// POST /api/advisor/anchor { as_of_date, amount, memo? }
router.post('/anchor', (req, res) => {
  try {
    const { as_of_date: date, amount, memo } = req.body || {};
    if (!isDate(String(date || ''))) return res.status(400).json({ error: '기준일은 YYYY-MM-DD 형식이어야 합니다.' });
    const n = Number(amount);
    if (!Number.isInteger(n) || Math.abs(n) > 10000000000) return res.status(400).json({ error: '보유현금은 원 단위 정수로 입력해 주세요.' });
    const id = db.prepare('INSERT INTO cash_anchors (as_of_date, amount, memo) VALUES (?, ?, ?)').run(date, n, memo ? String(memo).slice(0, 200) : null).lastInsertRowid;
    res.status(201).json({ id, as_of_date: date, amount: n });
  } catch (e) {
    serverError(res, e, 'advisor.anchor.post');
  }
});

module.exports = router;
