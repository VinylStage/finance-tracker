'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { asInt, missingFields, escapeLike } = require('../utils/validate');
const { serverError } = require('../utils/errors');
const { PAYMENT_STYLES } = require('../constants');

// FND-02(감사): 화면(client/Transactions.jsx)이 최대 5000건을 요청했지만
// 서버가 500건으로 잘라(응답의 total은 정확했지만 화면이 안 씀) 검색/월별합계/
// 연도탭이 최신 500건 범위 안에서만 동작했다. 근본 해결은 검색·집계를 서버
// 파라미터로 전부 넘기는 것 — 이 함수가 그 필터를 목록/월별요약 두 라우트가
// 공유하는 단일 WHERE 절로 만든다(중복 방지).
function buildTransactionFilters(query) {
  const { from, to, category_id, merchant, memo, min_amount, max_amount, payment_method_id } = query;
  let where = ' WHERE 1=1';
  const params = [];
  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to)   { where += ' AND t.date <= ?'; params.push(to); }
  if (category_id) {
    const ids = String(category_id).split(',').map(s => asInt(s.trim())).filter(v => v !== null);
    if (ids.length) { where += ` AND t.category_id IN (${ids.map(() => '?').join(',')})`; params.push(...ids); }
  }
  if (merchant) { where += ` AND t.merchant LIKE ? ESCAPE '\\'`; params.push(`%${escapeLike(merchant)}%`); }
  if (memo) { where += ` AND t.memo LIKE ? ESCAPE '\\'`; params.push(`%${escapeLike(memo)}%`); }
  if (min_amount !== undefined && min_amount !== '') {
    const v = asInt(min_amount);
    if (v !== null) { where += ' AND t.amount >= ?'; params.push(v); }
  }
  if (max_amount !== undefined && max_amount !== '') {
    const v = asInt(max_amount);
    if (v !== null) { where += ' AND t.amount <= ?'; params.push(v); }
  }
  if (payment_method_id) {
    const v = asInt(payment_method_id);
    if (v !== null) { where += ' AND t.payment_method_id = ?'; params.push(v); }
  }
  return { where, params };
}

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
function fmtDateObj(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function rangeTotalsByDate(from, to) {
  const rows = db.prepare(`
    SELECT t.date AS date,
      COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ? AND t.date <= ?
    GROUP BY t.date
  `).all(from, to);
  return new Map(rows.map(r => [r.date, r]));
}

function totalsForRange(from, to) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
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

  const curFrom = fmtDateObj(curMonday), curTo = fmtDateObj(curSunday);
  const prevFrom = fmtDateObj(prevMonday), prevTo = fmtDateObj(prevSunday);
  const curMap = rangeTotalsByDate(curFrom, curTo);
  const prevMap = rangeTotalsByDate(prevFrom, prevTo);

  const data = WEEKDAY_LABELS.map((label, i) => {
    const cDate = new Date(curMonday); cDate.setDate(curMonday.getDate() + i);
    const pDate = new Date(prevMonday); pDate.setDate(prevMonday.getDate() + i);
    const cKey = fmtDateObj(cDate), pKey = fmtDateObj(pDate);
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

  const monthRowsFor = (year) => {
    const rows = db.prepare(`
      SELECT strftime('%m', t.date) AS m,
        COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y', t.date) = ?
      GROUP BY m
    `).all(String(year));
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
        COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
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
    if (isNaN(anchor.getTime())) return res.status(400).json({ error: 'invalid date' });

    let result;
    if (period === 'daily') result = periodComparisonDaily(anchor);
    else if (period === 'weekly') result = periodComparisonWeekly(anchor);
    else if (period === 'yearly') result = periodComparisonYearly(anchor);
    else if (period === 'monthly') result = periodComparisonMonthly(anchor);
    else return res.status(400).json({ error: 'period must be one of daily|weekly|monthly|yearly' });

    const curTotals = totalsForRange(...result.currentRange);
    const prevTotals = totalsForRange(...result.previousRange);

    res.json({
      period,
      anchorDate: fmtDateObj(anchor),
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
    const { ids, all } = req.body || {};
    if (all === true) {
      const deleted = db.prepare('DELETE FROM transactions').run().changes;
      return res.json({ ok: true, deleted });
    }
    if (Array.isArray(ids) && ids.length > 0) {
      const validIds = ids.map(Number).filter(Number.isInteger);
      if (!validIds.length) return res.status(400).json({ error: 'ids must contain valid integers' });
      const placeholders = validIds.map(() => '?').join(',');
      const deleted = db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...validIds).changes;
      return res.json({ ok: true, deleted });
    }
    return res.status(400).json({ error: 'ids (non-empty array) or all=true required' });
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
    const { year } = req.query;
    if (!year || !/^\d{4}$/.test(year)) return res.status(400).json({ error: 'year (YYYY) required' });
    const { where, params } = buildTransactionFilters({
      ...req.query, from: `${year}-01-01`, to: `${year}-12-31`,
    });
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', t.date) AS month,
        COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense,
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
  if (!row) return res.status(404).json({ error: 'Not found' });
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
  // date 형식 검증 (ISO 8601 YYYY-MM-DD)
  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return 'date must be in YYYY-MM-DD format';
  if (body.payment_style !== undefined && body.payment_style !== null &&
      !PAYMENT_STYLES.includes(body.payment_style)) {
    return `payment_style must be one of ${PAYMENT_STYLES.join(', ')}`;
  }
  return null;
}

// POST /api/transactions
router.post('/', (req, res) => {
  try {
    const err = validateTxBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const { date, category_id, amount, payment_method_id, payment_style = '일시불', merchant, memo } = req.body;
    const result = db.prepare(`
      INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(date, asInt(category_id), asInt(amount), payment_method_id != null ? asInt(payment_method_id) : null,
           payment_style, merchant || null, memo || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// PUT /api/transactions/:id
router.put('/:id', (req, res) => {
  try {
    const err = validateTxBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const { date, category_id, amount, payment_method_id, payment_style, merchant, memo } = req.body;
    const result = db.prepare(`
      UPDATE transactions SET date=?, category_id=?, amount=?, payment_method_id=?,
        payment_style=?, merchant=?, memo=?
      WHERE id=?
    `).run(date, asInt(category_id), asInt(amount), payment_method_id != null ? asInt(payment_method_id) : null,
           payment_style || '일시불', merchant || null, memo || null, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'transactions');
  }
});

function pad2(n) { return String(n).padStart(2, '0'); }

function lastNDates(n) {
  const arr = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    arr.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
  }
  return arr;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function lastNWeeks(n) {
  const weeks = [];
  const thisMonday = mondayOf(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    weeks.push({ week: fmtDate(start), start: fmtDate(start), end: fmtDate(end) });
  }
  return weeks;
}

function lastNMonths(n) {
  const arr = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return arr;
}

// GET /api/transactions/summary/dashboard — 대시보드 집계
router.get('/summary/dashboard', (req, res) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const income = db.prepare(`
      SELECT COALESCE(SUM(t.amount),0) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y-%m', t.date) = ? AND c.major_type = '수입'
    `).get(thisMonth).total;

    const expense = db.prepare(`
      SELECT COALESCE(SUM(t.amount),0) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y-%m', t.date) = ? AND c.major_type != '수입'
      AND t.payment_style NOT IN ('할부','리볼빙')
    `).get(thisMonth).total;

    // 청구 기간(start_billing_month 부터 months 개월)이 이번 달을 포함하는 건만 합산한다
    const installmentsDue = db.prepare(`
      SELECT COALESCE(SUM(monthly_amount),0) AS total
      FROM installments
      WHERE status = '진행중'
        AND start_billing_month <= ?
        AND ? < strftime('%Y-%m', date(start_billing_month || '-01', '+' || months || ' months'))
    `).get(thisMonth, thisMonth).total;

    const revolvingPaid = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) AS total
      FROM revolving_history
      WHERE month = ?
    `).get(thisMonth).total;

    const budgets = db.prepare(`
      SELECT c.name, c.major_type, c.monthly_budget,
        COALESCE(SUM(t.amount),0) AS spent
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND strftime('%Y-%m', t.date) = ?
      WHERE c.is_active = 1 AND c.monthly_budget > 0
      GROUP BY c.id
    `).all(thisMonth);

    // 카테고리별 지출 분석 (도넛 차트용)
    const categoryBreakdown = db.prepare(`
      SELECT c.name AS category, COALESCE(SUM(t.amount),0) AS total, c.monthly_budget AS budget
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND strftime('%Y-%m', t.date) = ?
        AND t.payment_style NOT IN ('할부','리볼빙')
      WHERE c.is_active = 1 AND c.major_type != '수입'
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(thisMonth);

    // 최근 30일 일별 수입/지출
    const dailyRows = db.prepare(`
      SELECT t.date AS date,
        COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.date >= date('now', '-29 days')
      GROUP BY t.date
    `).all();
    const dailyMap = Object.fromEntries(dailyRows.map(r => [r.date, r]));
    const dailyTrend = lastNDates(30).map(date => ({
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
        const r = weekDayMap.get(fmtDateObj(d));
        if (r) { income += r.income; expense += r.expense; }
      }
      return { week: w.week, income, expense };
    });

    // 최근 12개월 월별 수입/지출 — 범위 전체를 월별 GROUP BY 로 한 번 조회(N+1 제거)
    const months = lastNMonths(12);
    const monthRows = db.prepare(`
      SELECT strftime('%Y-%m', t.date) AS ym,
        COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y-%m', t.date) >= ? AND strftime('%Y-%m', t.date) <= ?
      GROUP BY ym
    `).all(months[0], months[months.length - 1]);
    const monthMap = new Map(monthRows.map(r => [r.ym, r]));
    const monthlyTrend = months.map(month => {
      const r = monthMap.get(month) || { income: 0, expense: 0 };
      return { month, income: r.income, expense: r.expense };
    });

    // 이번 달 상위 5 가맹점
    const topMerchants = db.prepare(`
      SELECT t.merchant AS merchant, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y-%m', t.date) = ? AND c.major_type != '수입'
        AND t.payment_style NOT IN ('할부','리볼빙')
        AND t.merchant IS NOT NULL AND t.merchant != ''
      GROUP BY t.merchant
      ORDER BY total DESC
      LIMIT 5
    `).all(thisMonth);

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
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from, to required' });
    const data = db.prepare(`
      SELECT c.name AS category, COALESCE(SUM(t.amount),0) AS total
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.date >= ? AND t.date <= ?
        AND t.payment_style NOT IN ('할부','리볼빙')
      WHERE c.is_active = 1 AND c.major_type != '수입'
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(from, to);
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
