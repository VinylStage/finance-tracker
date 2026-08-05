'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { asInt, missingFields, escapeLike, toIdList } = require('../utils/validate');
const { serverError } = require('../utils/errors');
const { buildTransactionFilters } = require('../utils/transactionFilters');
const { resolvePeriod } = require('../utils/period');
const { isEditable, lockedMessage, findLocked, countLockedAll, derivedFilter } = require('../services/transactionOrigin');
const { PAYMENT_STYLES, SETTLEMENTS, DEFAULT_SETTLEMENT } = require('../constants');
const { resolveBillingMonth } = require('../services/settlementBilling');
const { pad2, lastNDates, mondayOf, lastNWeeks, lastNMonths, localYMD, monthBounds } = require('../utils/date');
const { INCOME_CASE, EXPENSE_CASE, EXPENSE_ROW, installmentsDueForMonth, rangeTotalsByDate, monthlyTotalsInRange } = require('../utils/aggregation');

// GET /api/transactions?limit=50&offset=0&from=&to=&category_id=&merchant=&memo=&min_amount=&max_amount=&payment_method_id=
router.get('/', (req, res) => {
  try {
    // limit/offset 은 정수로 강제하고 범위를 제한한다(잘못된 값으로 인한 500·과도한 조회 방지)
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    // WHERE 절을 목록 쿼리와 카운트 쿼리가 공유한다(total 이 필터를 반영하도록)
    const { where, params: whereParams } = buildTransactionFilters(req.query);

    const rows = db.prepare(`
      SELECT t.*, c.name AS category_name, c.major_type,
             p.name AS payment_method_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN payment_methods p ON t.payment_method_id = p.id
      ${where}
      ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?
    `).all(...whereParams, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) AS cnt FROM transactions t${where}
    `).get(...whereParams).cnt;

    res.json({ data: rows, total });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// --- 기간 비교 (period-comparison) 헬퍼 ---
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); } // month: 1-indexed
function fmtYMD(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

function totalsForRange(from, to) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(${INCOME_CASE}), 0) AS income,
      COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ? AND t.date <= ?
  `).get(from, to);
}

function pctDelta(a, b) { return b === 0 ? null : Math.round(((a - b) / b) * 100); }

function buildComparisonSummary(curTotals, prevTotals) {
  const curNet = curTotals.income - curTotals.expense;
  const prevNet = prevTotals.income - prevTotals.expense;
  return {
    currentIncome: curTotals.income, previousIncome: prevTotals.income,
    incomeDiff: curTotals.income - prevTotals.income, incomeDiffPercent: pctDelta(curTotals.income, prevTotals.income),
    currentExpense: curTotals.expense, previousExpense: prevTotals.expense,
    expenseDiff: curTotals.expense - prevTotals.expense, expenseDiffPercent: pctDelta(curTotals.expense, prevTotals.expense),
    currentNet: curNet, previousNet: prevNet,
    netDiff: curNet - prevNet, netDiffPercent: pctDelta(curNet, prevNet),
  };
}

function periodComparisonDaily(anchor) {
  const y = anchor.getFullYear(), m = anchor.getMonth() + 1;
  const prevAnchor = new Date(y, m - 2, 1);
  const py = prevAnchor.getFullYear(), pm = prevAnchor.getMonth() + 1;
  const curDays = daysInMonth(y, m);
  const prevDays = daysInMonth(py, pm);
  const curFrom = fmtYMD(y, m, 1), curTo = fmtYMD(y, m, curDays);
  const prevFrom = fmtYMD(py, pm, 1), prevTo = fmtYMD(py, pm, prevDays);
  const curMap = rangeTotalsByDate(curFrom, curTo);
  const prevMap = rangeTotalsByDate(prevFrom, prevTo);

  const maxDays = Math.max(curDays, prevDays);
  const data = [];
  for (let d = 1; d <= maxDays; d++) {
    const cDate = d <= curDays ? fmtYMD(y, m, d) : null;
    const pDate = d <= prevDays ? fmtYMD(py, pm, d) : null;
    const c = cDate ? (curMap.get(cDate) || { income: 0, expense: 0 }) : null;
    const p = pDate ? (prevMap.get(pDate) || { income: 0, expense: 0 }) : null;
    data.push({
      label: String(d), currentDate: cDate, previousDate: pDate,
      currentIncome: c ? c.income : null, currentExpense: c ? c.expense : null,
      previousIncome: p ? p.income : null, previousExpense: p ? p.expense : null,
    });
  }
  return {
    currentLabel: `${y}-${pad2(m)}`, previousLabel: `${py}-${pad2(pm)}`,
    currentRange: [curFrom, curTo], previousRange: [prevFrom, prevTo], data,
  };
}

function periodComparisonWeekly(anchor) {
  const curMonday = mondayOf(anchor);
  const prevMonday = new Date(curMonday); prevMonday.setDate(curMonday.getDate() - 7);
  const curSunday = new Date(curMonday); curSunday.setDate(curMonday.getDate() + 6);
  const prevSunday = new Date(prevMonday); prevSunday.setDate(prevMonday.getDate() + 6);

  const curFrom = localYMD(curMonday), curTo = localYMD(curSunday);
  const prevFrom = localYMD(prevMonday), prevTo = localYMD(prevSunday);
  const curMap = rangeTotalsByDate(curFrom, curTo);
  const prevMap = rangeTotalsByDate(prevFrom, prevTo);

  const data = WEEKDAY_LABELS.map((label, i) => {
    const cDate = new Date(curMonday); cDate.setDate(curMonday.getDate() + i);
    const pDate = new Date(prevMonday); pDate.setDate(prevMonday.getDate() + i);
    const cKey = localYMD(cDate), pKey = localYMD(pDate);
    const c = curMap.get(cKey) || { income: 0, expense: 0 };
    const p = prevMap.get(pKey) || { income: 0, expense: 0 };
    return {
      label, currentDate: cKey, previousDate: pKey,
      currentIncome: c.income, currentExpense: c.expense,
      previousIncome: p.income, previousExpense: p.expense,
    };
  });

  return {
    currentLabel: `${curFrom}~${curTo}`, previousLabel: `${prevFrom}~${prevTo}`,
    currentRange: [curFrom, curTo], previousRange: [prevFrom, prevTo], data,
  };
}

function periodComparisonMonthly(anchor) {
  const y = anchor.getFullYear();
  const py = y - 1;
  const curFrom = `${y}-01-01`, curTo = `${y}-12-31`;
  const prevFrom = `${py}-01-01`, prevTo = `${py}-12-31`;

  // FND-08(감사): strftime('%Y', t.date) = ? 는 인덱스 컬럼을 함수로 감싸
  // idx_tx_date를 못 쓴다(풀스캔). [해당 연도 1/1, 다음 연도 1/1) 범위
  // 비교로 바꾼다 — GROUP BY의 strftime('%m', ...)은 그대로 둬도 무방하다.
  const monthRowsFor = (year) => {
    const rows = db.prepare(`
      SELECT strftime('%m', t.date) AS m,
        COALESCE(SUM(${INCOME_CASE}), 0) AS income,
        COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ? AND t.date < ?
      GROUP BY m
    `).all(`${year}-01-01`, `${year + 1}-01-01`);
    return new Map(rows.map(r => [r.m, r]));
  };
  const curMap = monthRowsFor(y);
  const prevMap = monthRowsFor(py);

  const data = MONTH_LABELS.map((label, i) => {
    const mm = pad2(i + 1);
    const c = curMap.get(mm) || { income: 0, expense: 0 };
    const p = prevMap.get(mm) || { income: 0, expense: 0 };
    return {
      label, currentMonth: `${y}-${mm}`, previousMonth: `${py}-${mm}`,
      currentIncome: c.income, currentExpense: c.expense,
      previousIncome: p.income, previousExpense: p.expense,
    };
  });

  return {
    currentLabel: String(y), previousLabel: String(py),
    currentRange: [curFrom, curTo], previousRange: [prevFrom, prevTo], data,
  };
}

function periodComparisonYearly(anchor) {
  const y = anchor.getFullYear();
  const curYears = Array.from({ length: 5 }, (_, i) => y - 4 + i);
  const prevYears = curYears.map(yr => yr - 5);

  const yearRowsFor = (years) => {
    const from = `${years[0]}-01-01`, to = `${years[4]}-12-31`;
    const rows = db.prepare(`
      SELECT strftime('%Y', t.date) AS yr,
        COALESCE(SUM(${INCOME_CASE}), 0) AS income,
        COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ? AND t.date <= ?
      GROUP BY yr
    `).all(from, to);
    return new Map(rows.map(r => [r.yr, r]));
  };
  const curMap = yearRowsFor(curYears);
  const prevMap = yearRowsFor(prevYears);

  const data = curYears.map((yr, i) => {
    const pyr = prevYears[i];
    const c = curMap.get(String(yr)) || { income: 0, expense: 0 };
    const p = prevMap.get(String(pyr)) || { income: 0, expense: 0 };
    return {
      label: `${i + 1}년차`, currentYear: yr, previousYear: pyr,
      currentIncome: c.income, currentExpense: c.expense,
      previousIncome: p.income, previousExpense: p.expense,
    };
  });

  return {
    currentLabel: `${curYears[0]}~${curYears[4]}`, previousLabel: `${prevYears[0]}~${prevYears[4]}`,
    currentRange: [`${curYears[0]}-01-01`, `${curYears[4]}-12-31`],
    previousRange: [`${prevYears[0]}-01-01`, `${prevYears[4]}-12-31`], data,
  };
}

// GET /api/transactions/period-comparison?period=daily|weekly|monthly|yearly&date=YYYY-MM-DD
// 등록 순서 중요: 아래 `/:id` 라우트보다 반드시 앞에 있어야 함 (동일 segment 매칭 충돌)
router.get('/period-comparison', (req, res) => {
  try {
    const { period = 'monthly', date } = req.query;
    const anchor = date ? new Date(date) : new Date();
    if (isNaN(anchor.getTime())) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다. 2026-07-27 처럼 입력해 주세요.' });

    let result;
    if (period === 'daily') result = periodComparisonDaily(anchor);
    else if (period === 'weekly') result = periodComparisonWeekly(anchor);
    else if (period === 'yearly') result = periodComparisonYearly(anchor);
    else if (period === 'monthly') result = periodComparisonMonthly(anchor);
    else return res.status(400).json({ error: '조회 단위를 일·주·월·연 중에서 선택해 주세요.' });

    const curTotals = totalsForRange(...result.currentRange);
    const prevTotals = totalsForRange(...result.previousRange);

    res.json({
      period,
      anchorDate: localYMD(anchor),
      currentLabel: result.currentLabel,
      previousLabel: result.previousLabel,
      data: result.data,
      summary: buildComparisonSummary(curTotals, prevTotals),
    });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// DELETE /api/transactions - 일괄 삭제
// body: { ids: number[] } 선택 항목 삭제 | { all: true } 전체 초기화
router.delete('/', (req, res) => {
  try {
    const { ids, all, confirm } = req.body || {};
    if (all === true) {
      // 확인 토큰을 요구한다(#363). 같은 일(거래 전체 삭제)을 하는
      // POST /api/data/import?mode=overwrite 가 이미 DELETE_ALL 을 요구하는데
      // 이쪽만 무방비였다 — 화면의 확인 대화상자는 API 를 직접 부르면 우회된다.
      // 이 저장소는 실거래 2,212건 유실 사고를 겪었고, ADR 0008 이 그 뒤에
      // 세운 원칙이 "프리뷰 + 확인 없이 실행하지 않는다" 다.
      if (confirm !== 'DELETE_ALL') {
        return res.status(400).json({
          error: '전체 삭제는 추가 확인이 필요합니다. 화면의 안내를 따라 다시 시도해 주세요.',
        });
      }

      // 전체 삭제가 파생 거래까지 지우면 원본(할부·리볼빙·부채)과 어긋난다(#268).
      // 감사 FND-01 이 실증한 바로 그 경로라 여기서 반드시 막는다.
      const locked = countLockedAll(db);
      if (locked > 0) {
        return res.status(403).json({
          error: `자동으로 만들어진 내역 ${locked}건이 포함돼 있어 전체 삭제를 할 수 없어요. 할부·리볼빙·부채 화면에서 원본을 먼저 정리해 주세요.`,
        });
      }
      const deleted = db.prepare('DELETE FROM transactions').run().changes;
      return res.json({ ok: true, deleted });
    }
    if (Array.isArray(ids) && ids.length > 0) {
      const validIds = toIdList(ids);
      if (!validIds.length) return res.status(400).json({ error: '선택한 거래를 확인할 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.' });

      // 선택 목록에 잠긴 거래가 섞이면 전체를 거부한다. 일부만 지우면 사용자가
      // 무엇이 남았는지 알 수 없다.
      const lockedRows = findLocked(db, validIds);
      if (lockedRows.length) {
        return res.status(403).json({
          error: `선택한 내역 중 ${lockedRows.length}건은 자동으로 만들어진 것이라 지울 수 없어요. 원래 등록한 화면에서 정리해 주세요.`,
        });
      }

      const placeholders = validIds.map(() => '?').join(',');
      const deleted = db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...validIds).changes;
      return res.json({ ok: true, deleted });
    }
    return res.status(400).json({ error: '삭제할 거래를 선택해 주세요.' });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// GET /api/transactions/years — 거래가 존재하는 연도 목록(내림차순)
// FND-02(감사): 화면의 연도 탭이 (500건 클램프로 잘린) 인메모리 목록에서
// 파생됐다. 실제 존재하는 연도를 서버가 직접 계산해 내려준다.
// 등록 순서 중요: 아래 /:id 라우트보다 반드시 앞에 있어야 함(동일 세그먼트 매칭 충돌)
router.get('/years', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT strftime('%Y', date) AS year FROM transactions ORDER BY year DESC
    `).all();
    res.json({ data: rows.map(r => r.year) });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// GET /api/transactions/summary/by-month?year=YYYY&merchant=&memo=&min_amount=&max_amount=&payment_method_id=&category_id=
// FND-02(감사): 월별 수입/지출 합계·건수를 (500건 클램프로 잘린) 인메모리
// 목록에서 계산했다. 서버가 GROUP BY로 직접 계산해, 필터가 걸려도 화면에
// 보이는 합계가 항상 전체 데이터 기준이 되도록 한다.
// 등록 순서 무관(세그먼트 2개라 /:id 와 충돌 없음) — 가독성상 /:id 근처에 둔다.
router.get('/summary/by-month', (req, res) => {
  try {
    // year 를 그대로 받되 from/to 공통 규약도 받는다(#272). 기존 호출부는
    // year 만 보내므로 동작이 바뀌지 않는다.
    const period = resolvePeriod(req.query);
    if (period.error) return res.status(400).json({ error: period.error });
    if (!period.from || !period.to) {
      return res.status(400).json({ error: '조회할 연도를 선택해 주세요.' });
    }
    const { where, params } = buildTransactionFilters({
      ...req.query, from: period.from, to: period.to,
    });
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', t.date) AS month,
        COALESCE(SUM(${INCOME_CASE}), 0) AS income,
        COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense,
        COUNT(*) AS count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      ${where}
      GROUP BY month
      ORDER BY month DESC
    `).all(...params);
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// GET /api/transactions/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, c.name AS category_name, c.major_type, p.name AS payment_method_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payment_methods p ON t.payment_method_id = p.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: '찾는 거래가 없습니다. 이미 삭제됐을 수 있어요.' });
  res.json(row);
});

// 거래 필드 검증. 문제가 있으면 에러 메시지 문자열, 없으면 null 을 반환한다.
// (POST/PUT 공통)
function validateTxBody(body) {
  const missing = missingFields(body, ['date', 'category_id', 'amount']);
  if (missing.length) return `${missing.join(', ')} required`;
  if (asInt(body.category_id) === null) return 'category_id must be an integer';
  if (asInt(body.amount) === null) return 'amount must be an integer';
  if (body.payment_method_id !== undefined && body.payment_method_id !== null &&
      asInt(body.payment_method_id) === null) return 'payment_method_id must be an integer';
  if (body.card_product_id !== undefined && body.card_product_id !== null &&
      asInt(body.card_product_id) === null) return 'card_product_id must be an integer';
  // date 형식 검증 (ISO 8601 YYYY-MM-DD)
  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return 'date must be in YYYY-MM-DD format';
  if (body.payment_style !== undefined && body.payment_style !== null &&
      !PAYMENT_STYLES.includes(body.payment_style)) {
    return `payment_style must be one of ${PAYMENT_STYLES.join(', ')}`;
  }
  // DB 에 CHECK 를 걸지 않으므로(#289) 여기가 값을 지키는 유일한 곳이다.
  // 잘못된 값이 들어가면 잔액 계산에서 조용히 빠진다 — 어느 합계에도 안 잡힌다.
  if (body.settlement !== undefined && body.settlement !== null &&
      !SETTLEMENTS.includes(body.settlement)) {
    return `settlement must be one of ${SETTLEMENTS.join(', ')}`;
  }
  if (body.billing_month !== undefined && body.billing_month !== null &&
      !/^\d{4}-\d{2}$/.test(body.billing_month)) {
    return 'billing_month must be in YYYY-MM format';
  }
  return null;
}

// 청구월을 정할 때 쓸 카드의 결제 주기. 상품을 모르면 null 이고, 그러면
// resolveBillingMonth 가 청구월을 안 적는다(#289).
function cycleOf(cardProductId) {
  if (cardProductId == null) return null;
  return db.prepare(
    'SELECT billing_cycle_day, statement_close_day FROM card_products WHERE id = ?'
  ).get(asInt(cardProductId)) || null;
}

// 카드상품과 카드사가 어긋나지 않게 막는다(#302 2단계). 화면은 둘을 한 선택지로
// 고르지만 API 는 따로 받으므로, 여기서 확인하지 않으면 "삼성카드로 결제한 하나
// A카드" 같은 거래가 저장된다 — 카드 전략 계산이 그걸 그대로 믿는다.
//
// DB 를 봐야 해서 validateTxBody 와 분리했다(그쪽은 순수 함수다).
// 문제가 있으면 메시지 문자열, 없으면 null 을 반환한다.
function validateCardProduct(body) {
  if (body.card_product_id === undefined || body.card_product_id === null) return null;

  const product = db.prepare('SELECT payment_method_id FROM card_products WHERE id=?')
    .get(asInt(body.card_product_id));
  if (!product) return '선택한 카드를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 골라 주세요.';

  const methodId = body.payment_method_id != null ? asInt(body.payment_method_id) : null;
  if (methodId !== product.payment_method_id) {
    return '카드와 카드사가 맞지 않습니다. 결제수단을 다시 골라 주세요.';
  }
  return null;
}

// POST /api/transactions
router.post('/', (req, res) => {
  try {
    const err = validateTxBody(req.body) || validateCardProduct(req.body);
    if (err) return res.status(400).json({ error: err });
    const {
      date, category_id, amount, payment_method_id, card_product_id, payment_style = '일시불', merchant, memo,
      settlement = DEFAULT_SETTLEMENT, account_id, billing_month,
    } = req.body;
    // 기본값이 immediate 라 안 보내던 클라이언트의 동작이 그대로다(#289).
    const result = db.prepare(`
      INSERT INTO transactions (date, category_id, amount, payment_method_id, card_product_id, payment_style, merchant, memo, settlement, account_id, billing_month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, asInt(category_id), asInt(amount), payment_method_id != null ? asInt(payment_method_id) : null,
           card_product_id != null ? asInt(card_product_id) : null,
           payment_style, merchant || null, memo || null,
           settlement, account_id != null ? asInt(account_id) : null,
           resolveBillingMonth({
             settlement, date, billingMonth: billing_month, cardProduct: cycleOf(card_product_id),
           }));
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// PUT /api/transactions/:id
router.put('/:id', (req, res) => {
  try {
    const err = validateTxBody(req.body) || validateCardProduct(req.body);
    if (err) return res.status(400).json({ error: err });

    // 파생 거래는 거래내역에서 고칠 수 없다(#268). 원본을 고쳐야 계산과 맞는다.
    const target = db.prepare('SELECT id, origin, settlement, date, card_product_id, billing_month FROM transactions WHERE id=?').get(req.params.id);
    if (!target) return res.status(404).json({ error: '찾는 거래가 없습니다. 이미 삭제됐을 수 있어요.' });
    if (!isEditable(target)) return res.status(403).json({ error: lockedMessage(target) });

    const {
      date, category_id, amount, payment_method_id, card_product_id, payment_style, merchant, memo,
      settlement, account_id, billing_month,
    } = req.body;
    // settlement 는 **보낸 경우에만** 바꾼다. PUT 이 전체 교체라 생략하면
    // 기본값으로 덮이는데, 그러면 deferred 였던 거래를 메모만 고쳐도 잔액이
    // 조용히 달라진다(#289). 나머지 둘도 같은 이유로 COALESCE 를 쓴다.
    //
    // card_product_id 는 COALESCE 를 쓰지 않는다. 카드사와 짝이라 payment_method_id
    // 와 같은 규칙을 따라야 하고(카드사를 바꾸면 카드도 다시 정해져야 한다),
    // 무엇보다 "카드사는 알지만 어느 카드인지 모른다"(#306 의 미상) 로 되돌릴 길이
    // 없어진다 — COALESCE 면 null 을 보내도 옛 값이 남는다.
    //
    // billing_month 는 date·card_product_id·settlement 에서 나오는 **파생값**이다.
    // 그래서 두 요구가 부딪힌다.
    //
    //   구매일을 고쳤는데 옛 청구월이 남으면 → 엉뚱한 달에 묶인 채로 남고
    //     사용자는 25일에 빠질 금액을 잘못 본다
    //   메모만 고쳤는데 청구월이 지워지면   → 사용자가 손으로 넣은 값이 사라진다
    //
    // 그래서 **입력이 실제로 바뀐 경우에만** 다시 계산한다. 파생값은 자기 입력을
    // 따라가되, 입력이 그대로면 건드리지 않는다.
    const nextSettlement = settlement || target.settlement;
    const nextCardProduct = card_product_id != null ? asInt(card_product_id) : null;
    const billingInputsChanged = date !== target.date
      || nextCardProduct !== target.card_product_id
      || nextSettlement !== target.settlement;

    const nextBillingMonth = billing_month
      ? billing_month
      : (billingInputsChanged
        ? resolveBillingMonth({
          settlement: nextSettlement, date, cardProduct: cycleOf(card_product_id),
        })
        : target.billing_month);
    const result = db.prepare(`
      UPDATE transactions SET date=?, category_id=?, amount=?, payment_method_id=?, card_product_id=?,
        payment_style=?, merchant=?, memo=?,
        settlement=COALESCE(?, settlement),
        account_id=COALESCE(?, account_id),
        billing_month=?
      WHERE id=?
    `).run(date, asInt(category_id), asInt(amount), payment_method_id != null ? asInt(payment_method_id) : null,
           card_product_id != null ? asInt(card_product_id) : null,
           payment_style || '일시불', merchant || null, memo || null,
           settlement || null, account_id != null ? asInt(account_id) : null,
           nextBillingMonth,
           req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: '찾는 거래가 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  try {
    // 파생 거래는 거래내역에서 지울 수 없다(#268). 원본을 지워야 함께 사라진다.
    const target = db.prepare('SELECT id, origin, settlement, date, card_product_id, billing_month FROM transactions WHERE id=?').get(req.params.id);
    if (!target) return res.status(404).json({ error: '찾는 거래가 없습니다. 이미 삭제됐을 수 있어요.' });
    if (!isEditable(target)) return res.status(403).json({ error: lockedMessage(target) });

    const result = db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: '찾는 거래가 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// GET /api/transactions/summary/dashboard — 대시보드 집계
router.get('/summary/dashboard', (req, res) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    // FND-08(감사): strftime('%Y-%m', t.date) = ? 는 인덱스 컬럼을 함수로
    // 감싸 idx_tx_date를 못 쓴다(풀스캔). 이번 달의 [1일, 다음달 1일) 범위
    // 비교로 바꿔 이 라우트의 모든 "이번 달" 조회에서 재사용한다.
    const [monthStart, monthEnd] = monthBounds(thisMonth);

    // FND-13 의 단일 상수화가 이 두 쿼리만 빠뜨려 지출 규칙이 여기에 다시
    // 인라인으로 적혀 있었다. #269 가 파생 부채이자를 지출에서 빼면서 한쪽만
    // 고쳐지는 문제가 실제로 드러나 공유 상수로 옮긴다.
    const income = db.prepare(`
      SELECT COALESCE(SUM(${INCOME_CASE}),0) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ? AND t.date < ?
    `).get(monthStart, monthEnd).total;

    const expense = db.prepare(`
      SELECT COALESCE(SUM(${EXPENSE_CASE}),0) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ? AND t.date < ?
    `).get(monthStart, monthEnd).total;

    // FND-05(감사): 이 정확한 버전을 /api/installments가 별도로 재구현하며
    // 청구 기간 종료를 놓쳐 서로 다른 값을 반환했다. 공유 함수로 통일.
    const installmentsDue = installmentsDueForMonth(thisMonth);

    const revolvingPaid = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) AS total
      FROM revolving_history
      WHERE month = ?
    `).get(thisMonth).total;

    const budgets = db.prepare(`
      SELECT c.name, c.major_type, c.monthly_budget,
        COALESCE(SUM(t.amount),0) AS spent
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.date >= ? AND t.date < ?
      WHERE c.is_active = 1 AND c.monthly_budget > 0
      GROUP BY c.id
    `).all(monthStart, monthEnd);

    // 카테고리별 지출 분석 (도넛 차트용)
    //
    // major_type 을 함께 내려준다. 자금흐름 화면이 "수입이 어디로 갔나" 를 대분류
    // 단위로 묶는데, 카테고리 이름만으로는 어느 갈래에 속하는지 알 수 없다.
    // 기존 소비자는 이 필드를 무시하므로 추가만으로 끝난다.
    const categoryBreakdown = db.prepare(`
      SELECT c.name AS category, c.major_type, COALESCE(SUM(t.amount),0) AS total, c.monthly_budget AS budget
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.date >= ? AND t.date < ?
        AND ${EXPENSE_ROW}
      WHERE c.is_active = 1 AND c.major_type != '수입'
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(monthStart, monthEnd);

    // 최근 30일 일별 수입/지출
    // FND-20(감사): date('now', '-29 days')는 UTC 기준이라 KST 자정~9시 사이엔
    // 경계가 하루 밀렸다. 이미 KST 기준으로 정확한 lastNDates(30)의 첫 날짜를
    // 그대로 바인딩해 SQL이 'now'를 참조하지 않도록 한다.
    const dailyDates = lastNDates(30);
    const dailyRows = db.prepare(`
      SELECT t.date AS date,
        COALESCE(SUM(${INCOME_CASE}), 0) AS income,
        COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ?
      GROUP BY t.date
    `).all(dailyDates[0]);
    const dailyMap = Object.fromEntries(dailyRows.map(r => [r.date, r]));
    const dailyTrend = dailyDates.map(date => ({
      date,
      income: dailyMap[date]?.income || 0,
      expense: dailyMap[date]?.expense || 0,
    }));

    // 최근 12주 주별 수입/지출 — 전체 범위를 날짜별로 한 번 조회하고 JS에서 주별로 합산(N+1 제거)
    const weeks = lastNWeeks(12);
    const weekDayMap = rangeTotalsByDate(weeks[0].start, weeks[weeks.length - 1].end);
    const weeklyTrend = weeks.map(w => {
      let income = 0, expense = 0;
      for (let d = new Date(w.start), end = new Date(w.end); d <= end; d.setDate(d.getDate() + 1)) {
        const r = weekDayMap.get(localYMD(d));
        if (r) { income += r.income; expense += r.expense; }
      }
      return { week: w.label, income, expense };
    });

    // 최근 12개월 월별 수입/지출 — 범위 전체를 월별 GROUP BY 로 한 번 조회(N+1 제거)
    // FND-08(감사): WHERE 절도 strftime 등호 비교(비sargable) 대신 범위
    // 비교로 바꿔 cashflow.js와 함께 쓰는 공유 함수로 통일한다.
    const months = lastNMonths(12);
    const monthMap = monthlyTotalsInRange(months[0], months[months.length - 1]);
    const monthlyTrend = months.map(month => {
      const r = monthMap.get(month) || { income: 0, expense: 0 };
      return { month, income: r.income, expense: r.expense };
    });

    // 이번 달 상위 5 가맹점
    const topMerchants = db.prepare(`
      SELECT t.merchant AS merchant, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ? AND t.date < ? AND c.major_type != '수입'
        AND ${EXPENSE_ROW}
        AND t.merchant IS NOT NULL AND t.merchant != ''
      GROUP BY t.merchant
      ORDER BY total DESC
      LIMIT 5
    `).all(monthStart, monthEnd);

    res.json({
      thisMonth, income, expense,
      available: income - expense - installmentsDue - revolvingPaid,
      installmentsDue, revolvingPaid, budgets,
      categoryBreakdown, dailyTrend, weeklyTrend, monthlyTrend, topMerchants,
    });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// GET /api/transactions/summary/category-breakdown?from=&to= — 임의 기간 카테고리별 지출
router.get('/summary/category-breakdown', (req, res) => {
  try {
    // 기간 검증을 여기서도 resolvePeriod 로 돌린다. 라우트마다 직접 비교하면
    // "시작이 종료보다 뒤" 같은 판정이 엔드포인트마다 달라진다(#272).
    const period = resolvePeriod(req.query);
    if (period.error) return res.status(400).json({ error: period.error });
    if (!period.from || !period.to) return res.status(400).json({ error: '조회할 기간을 선택해 주세요.' });

    const derived = derivedFilter(req.query);
    const data = db.prepare(`
      SELECT c.name AS category, COALESCE(SUM(t.amount),0) AS total
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.date >= ? AND t.date <= ?
        AND ${EXPENSE_ROW}
        ${derived.sql}
      WHERE c.is_active = 1 AND c.major_type != '수입'
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(period.from, period.to, ...derived.params);
    res.json({ data });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// GET /api/transactions/suggest/category?merchant=
router.get('/suggest/category', (req, res) => {
  const { merchant } = req.query;
  if (!merchant) return res.json({ category_id: null, confidence: '없음' });
  const exact = db.prepare(`
    SELECT category_id FROM transactions WHERE merchant = ? ORDER BY date DESC LIMIT 1
  `).get(merchant);
  if (exact) return res.json({ category_id: exact.category_id, confidence: '완전일치' });
  const partial = db.prepare(`
    SELECT category_id, COUNT(*) as cnt FROM transactions
    WHERE merchant LIKE ? ESCAPE '\\' GROUP BY category_id ORDER BY cnt DESC LIMIT 1
  `).get(`%${escapeLike(merchant)}%`);
  if (partial) return res.json({ category_id: partial.category_id, confidence: '부분일치' });
  res.json({ category_id: null, confidence: '없음' });
});

// GET /api/transactions/suggest/merchants?limit=10 — 최근 사용 가맹점 (자동완성용)
router.get('/suggest/merchants', (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const rows = db.prepare(`
    SELECT merchant, MAX(date) AS last_date
    FROM transactions
    WHERE merchant IS NOT NULL AND merchant != ''
    GROUP BY merchant
    ORDER BY last_date DESC
    LIMIT ?
  `).all(limit);
  res.json({ data: rows.map(r => r.merchant) });
});

module.exports = router;
