'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { asInt, missingFields, numericBody } = require('../utils/validate');
const { serverError, errMsg } = require('../utils/errors');
const { PAYMENT_STYLES, RECURRING_FREQS } = require('../constants');
const { getLastCatchupSummary, setLastCatchupSummary, runCatchup, localToday } = require('../services/recurringCatchup');

function pad2(n) { return String(n).padStart(2, '0'); }
function thisYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

// day_of_month가 해당 월의 실제 일수를 넘으면(예: 31일 규칙 + 2월) 그 달의 마지막 날로 맞춘다.
function resolveDate(yearMonth, dayOfMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${yearMonth}-${pad2(day)}`;
}

function isYMD(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

function today() {
  // 로컬 기준이다. UTC 로 하면 KST 자정~9시 사이에 하루 어긋난다(FND-20).
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// #278 이 컬럼을 넣었지만 쓰기 경로가 없었다 — 화면에서 만든 규칙은 전부
// monthly/1 에 starts_on 이 비어 있었다. 여기서 받아야 #280 의 편집 화면이 성립한다.
//
// **`starts_on` 은 API 에서 선택이다.** 화면은 필수로 받지만, 생략한 기존 호출을
// 400 으로 만들면 이미 있는 경로가 깨진다.
//
// 생략했을 때 무엇으로 채우는지가 만들 때와 고칠 때 다르다. 수정에서 오늘로
// 채우면 **시작일을 안 보낸 클라이언트가 규칙의 시작일을 조용히 날린다.**
// 기존 행이 있으면 그 값을 잇고, 새 규칙일 때만 오늘로 본다.
// 보내지 않은 반복 필드는 기존 값을 잇는다. 이 라우트는 일부 필드만 보내는
// 호출부가 있고(재활성화), 안 보낸 값을 기본값으로 덮으면 **연 반복의 지정 월이나
// 종료일이 조용히 사라진다.** 명시적으로 null 을 보낸 것은 지우려는 뜻이므로
// 값이 아니라 키의 유무로 가른다.
function normalizeRuleBody(body, existing = null) {
  const carry = (key, fallback) => (key in body ? body[key] : (existing ? existing[key] : fallback));

  const freq = body.freq || existing?.freq || 'monthly';
  const rawStart = carry('starts_on', null);
  const startsOn = rawStart == null ? (existing?.starts_on || today()) : rawStart;

  // daily 는 day_of_month 를 안 쓴다(발생일은 starts_on + interval 로 정해진다).
  // 그래도 컬럼이 NOT NULL 이라 값은 있어야 하므로 시작일의 일자를 넣는다.
  let dayOfMonth = carry('day_of_month', null);
  if (dayOfMonth == null && freq === 'daily' && isYMD(startsOn)) {
    dayOfMonth = Number(startsOn.slice(8, 10));
  }

  return {
    ...body,
    freq,
    starts_on: startsOn,
    day_of_month: dayOfMonth,
    interval: carry('interval', 1),
    ends_on: carry('ends_on', null),
    month_of_year: carry('month_of_year', null),
  };
}

function validateRuleBody(body) {
  const missing = missingFields(body, ['category_id', 'merchant', 'amount', 'day_of_month']);
  if (missing.length) return `${missing.join(', ')} required`;
  if (asInt(body.category_id) === null) return 'category_id must be an integer';
  if (asInt(body.amount) === null) return 'amount must be an integer';
  const day = asInt(body.day_of_month);
  if (day === null || day < 1 || day > 31) return 'day_of_month must be an integer between 1 and 31';
  if (body.payment_method_id !== undefined && body.payment_method_id !== null &&
      asInt(body.payment_method_id) === null) return 'payment_method_id must be an integer';
  if (body.payment_style !== undefined && body.payment_style !== null &&
      !PAYMENT_STYLES.includes(body.payment_style)) {
    return `payment_style must be one of ${PAYMENT_STYLES.join(', ')}`;
  }

  if (!RECURRING_FREQS.includes(body.freq)) {
    return `freq must be one of ${RECURRING_FREQS.join(', ')}`;
  }
  if (body.interval !== undefined && body.interval !== null) {
    const n = asInt(body.interval);
    if (n === null || n < 1) return 'interval must be an integer of at least 1';
  }
  if (!isYMD(body.starts_on)) return 'starts_on must be YYYY-MM-DD';
  if (body.ends_on !== undefined && body.ends_on !== null && body.ends_on !== '') {
    if (!isYMD(body.ends_on)) return 'ends_on must be YYYY-MM-DD';
    // 'YYYY-MM-DD' 는 사전순 비교가 곧 시간순이다.
    if (body.ends_on < body.starts_on) return 'ends_on must not be earlier than starts_on';
  }
  if (body.month_of_year !== undefined && body.month_of_year !== null && body.month_of_year !== '') {
    const m = asInt(body.month_of_year);
    if (m === null || m < 1 || m > 12) return 'month_of_year must be an integer between 1 and 12';
  }
  return null;
}

// 규칙 행에 쓸 값으로 정리한다. INSERT 와 UPDATE 가 같은 정리를 쓰게 한다 —
// 한쪽만 고치면 만들 때와 고칠 때 동작이 갈린다.
function ruleColumns(body) {
  const blank = (v) => (v === undefined || v === null || v === '' ? null : v);
  return {
    category_id: asInt(body.category_id),
    merchant: body.merchant,
    amount: asInt(body.amount),
    day_of_month: asInt(body.day_of_month),
    payment_method_id: body.payment_method_id != null ? asInt(body.payment_method_id) : null,
    payment_style: body.payment_style || '일시불',
    memo: blank(body.memo),
    freq: body.freq,
    interval: body.interval != null && body.interval !== '' ? asInt(body.interval) : 1,
    starts_on: body.starts_on,
    ends_on: blank(body.ends_on),
    // 연 반복이 아니면 월 지정은 의미가 없다. 남겨 두면 주기를 바꿨을 때
    // 안 보이는 값이 계산에 끼어든다.
    month_of_year: body.freq === 'yearly' ? asInt(blank(body.month_of_year)) : null,
  };
}

// GET /api/recurring-rules?include_inactive=1
// 기동 시 따라잡기 결과(#279). 고정 경로이므로 /:id 형태 라우트보다 앞에 둔다 —
// 뒤에 두면 나중에 GET /:id 가 생겼을 때 조용히 가려진다.
router.get('/catchup', (_req, res) => {
  res.json(getLastCatchupSummary());
});

// POST /api/recurring-rules/catchup/run — 따라잡기를 지금 한 번 돌린다(#498).
//
// 지금까지 `runCatchup` 은 기동 경로에서만 불렸다. 이 앱은 사용자가 열 때만
// 프로세스가 살아서(상시 스케줄러가 없다) **규칙을 새로 만들어도 다음 기동까지
// 아무 일도 안 일어난다.** 며칠이 지날 수도 있다.
//
// 함수는 이미 `options` 를 받게 돼 있었다 — 부르는 입구만 없었다.
//
// 프리뷰를 요구하지 않는다. 되돌릴 수 있고(생성된 거래를 지우면 된다) 같은 회차를
// 두 번 만들지 않는다(`INSERT OR IGNORE`). 다만 **몇 건이 생겼는지 응답이 말한다** —
// 공백이 길면 수십 건이 한 번에 생긴다(#280 과 같은 이유).
//
// '/catchup' 뒤, '/:id' 형태보다 앞에 둔다.
router.post('/catchup/run', (req, res) => {
  try {
    const asked = (req.body || {}).today;
    if (asked !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(asked))) {
      return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다. 2026-08-06 처럼 입력해 주세요.' });
    }
    // **미래로는 못 간다.** 넘겨받은 날짜를 그대로 쓰면 아직 오지 않은 회차까지
    // 만들어지고, 그건 사용자가 지우기 전까지 가계부에 남는다.
    const real = localToday();
    const today = asked && String(asked) < real ? String(asked) : real;

    const summary = runCatchup(db, { today });
    setLastCatchupSummary(summary);
    res.json(summary);
  } catch (e) {
    serverError(res, e, 'recurring-rules');
  }
});

router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.include_inactive;
    let query = `
      SELECT r.*, c.name AS category_name, c.major_type, p.name AS payment_method_name
      FROM recurring_rules r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN payment_methods p ON r.payment_method_id = p.id
    `;
    if (!includeInactive) query += ' WHERE r.is_active = 1';
    query += ' ORDER BY r.day_of_month, r.merchant';
    res.json(db.prepare(query).all());
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// GET /api/recurring-rules/due?month=YYYY-MM — 이번 달(기본값) 확인 대상 목록
router.get('/due', (req, res) => {
  try {
    const yearMonth = req.query.month || thisYearMonth();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다. 2026-07 처럼 입력해 주세요.' });
    const rows = db.prepare(`
      SELECT r.*, c.name AS category_name, p.name AS payment_method_name
      FROM recurring_rules r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN payment_methods p ON r.payment_method_id = p.id
      WHERE r.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM recurring_rule_months m WHERE m.rule_id = r.id AND m.year_month = ?
        )
      ORDER BY r.day_of_month, r.merchant
    `).all(yearMonth);
    res.json({ month: yearMonth, data: rows });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// POST /api/recurring-rules
router.post('/', (req, res) => {
  try {
    const body = normalizeRuleBody(req.body);
    const err = validateRuleBody(body);
    if (err) return res.status(400).json({ error: err });
    const c = ruleColumns(body);
    const result = db.prepare(`
      INSERT INTO recurring_rules
        (category_id, merchant, amount, day_of_month, payment_method_id, payment_style, memo,
         freq, interval, starts_on, ends_on, month_of_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(c.category_id, c.merchant, c.amount, c.day_of_month, c.payment_method_id,
           c.payment_style, c.memo, c.freq, c.interval, c.starts_on, c.ends_on, c.month_of_year);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// PUT /api/recurring-rules/:id
router.put('/:id', numericBody(['is_active']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM recurring_rules WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });

    const body = normalizeRuleBody(req.body, existing);
    const err = validateRuleBody(body);
    if (err) return res.status(400).json({ error: err });
    const c = ruleColumns(body);
    const result = db.prepare(`
      UPDATE recurring_rules SET category_id=?, merchant=?, amount=?, day_of_month=?,
        payment_method_id=?, payment_style=?, memo=?, is_active=?,
        freq=?, interval=?, starts_on=?, ends_on=?, month_of_year=?
      WHERE id=?
    `).run(c.category_id, c.merchant, c.amount, c.day_of_month, c.payment_method_id,
           c.payment_style, c.memo, req.body.is_active ?? 1,
           c.freq, c.interval, c.starts_on, c.ends_on, c.month_of_year, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// DELETE /api/recurring-rules/:id — 다른 관리 화면(카테고리/결제수단)과 동일하게 소프트 삭제
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('UPDATE recurring_rules SET is_active=0 WHERE id=?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// POST /api/recurring-rules/:id/confirm — body: { month? } — 실제 거래 생성 + 이번 달 처리 완료 기록
router.post('/:id/confirm', (req, res) => {
  try {
    const yearMonth = req.body.month || thisYearMonth();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다. 2026-07 처럼 입력해 주세요.' });
    const rule = db.prepare('SELECT * FROM recurring_rules WHERE id=? AND is_active=1').get(req.params.id);
    if (!rule) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });

    const date = resolveDate(yearMonth, rule.day_of_month);
    const result = db.transaction(() => {
      const tx = db.prepare(`
        INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(date, rule.category_id, rule.amount, rule.payment_method_id, rule.payment_style, rule.merchant, rule.memo);
      db.prepare(`
        INSERT INTO recurring_rule_months (rule_id, year_month, status, transaction_id) VALUES (?, ?, 'created', ?)
      `).run(rule.id, yearMonth, tx.lastInsertRowid);
      return tx.lastInsertRowid;
    })();

    res.status(201).json({ ok: true, transaction_id: result });
  } catch (e) {
    if (errMsg(e).includes('UNIQUE')) {
      return res.status(409).json({ error: '이미 이번 달 처리(생성 또는 건너뛰기)된 규칙입니다.' });
    }
    serverError(res, e, 'recurringRules');
  }
});

// POST /api/recurring-rules/:id/skip — body: { month? } — 거래 생성 없이 이번 달 처리 완료로 기록
router.post('/:id/skip', (req, res) => {
  try {
    const yearMonth = req.body.month || thisYearMonth();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다. 2026-07 처럼 입력해 주세요.' });
    const rule = db.prepare('SELECT id FROM recurring_rules WHERE id=? AND is_active=1').get(req.params.id);
    if (!rule) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });

    db.prepare(`
      INSERT INTO recurring_rule_months (rule_id, year_month, status) VALUES (?, ?, 'skipped')
    `).run(rule.id, yearMonth);
    res.json({ ok: true });
  } catch (e) {
    if (errMsg(e).includes('UNIQUE')) {
      return res.status(409).json({ error: '이미 이번 달 처리(생성 또는 건너뛰기)된 규칙입니다.' });
    }
    serverError(res, e, 'recurringRules');
  }
});

module.exports = router;
