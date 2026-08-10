'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { asInt, numericBody } = require('../utils/validate');
const {
  createDebtInterestDerived, deleteDebtDerived, derivedRowsForDebt,
  createRepaymentDerived, deleteDebtRepaymentDerived, deleteDerivedFor,
} = require('../services/derivedTransactions');
const {
  validateRepayment, recordRepayment, listRepayments, deleteRepayment,
  balanceTimeline,
} = require('../services/debtRepayment');
const {
  validateLoanFields, creditLineStatus, settingsFor, strategyFor,
} = require('../services/interest');
const {
  setDebtRate, listRates, rateAt, rateTimeline, validateRateChange,
} = require('../services/debtRate');


// GET /api/debts
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT *, ROUND(balance * annual_rate / 100.0 / 12) AS monthly_interest
      FROM debts
      ORDER BY balance DESC
    `).all();
    // 유형별 계산 설정과 한도 상태를 함께 내려준다. 화면이 loan_type 을 보고
    // 다시 규칙을 재구성하면 서버와 어긋난다(#285).
    const data = rows.map((d) => ({
      ...d,
      interest_settings: settingsFor(d),
      credit_line: creditLineStatus(d),
    }));
    const total_balance = data.reduce((s, d) => s + d.balance, 0);
    const total_monthly_interest = data.reduce((s, d) => s + d.monthly_interest, 0);
    res.json({ data, total_balance, total_monthly_interest });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// POST /api/debts
router.post('/', numericBody(['balance', 'credit_limit', 'compounds', 'interest_day']), (req, res) => {
  try {
    const {
      name, balance, annual_rate = 0, type = '일반', memo,
      loan_type = 'general', credit_limit, interest_basis, compounds, interest_day,
      rate_effective_from,
    } = req.body;
    if (!name || balance === undefined) {
      return res.status(400).json({ error: '부채 이름과 잔액은 필수입니다.' });
    }
    const rateInvalid = validateAnnualRate(annual_rate);
    if (rateInvalid) return res.status(400).json({ error: rateInvalid });
    const invalid = validateLoanFields({ loan_type, credit_limit });
    if (invalid) return res.status(400).json({ error: invalid });

    // 부채 등록과 금리 이력 첫 행이 한 덩어리다. 이력이 비면 과거 구간 계산이
    // 통째로 막힌다(#285).
    let newId;
    db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO debts (name, balance, annual_rate, type, memo,
                           loan_type, credit_limit, interest_basis, compounds, interest_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, balance, annual_rate, type, memo || null,
             loan_type, credit_limit ?? null, interest_basis || null,
             compounds === undefined ? null : asInt(compounds), interest_day ?? null);
      newId = Number(result.lastInsertRowid);

      setDebtRate(db, newId, {
        annual_rate: Number(annual_rate) || 0,
        effective_from: rate_effective_from || todayYMD(),
        memo: '등록 시 금리',
      });
    })();

    res.status(201).json({ id: newId, ok: true });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// PUT /api/debts/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });
    const merged = { ...existing, ...req.body };
    const invalid = validateLoanFields(merged);
    if (invalid) return res.status(400).json({ error: invalid });

    // annual_rate 는 여기서 고치지 않는다. 금리는 시점이 붙어야 의미가 있어서
    // POST /:id/rates 로만 바꾼다 — 여기서 덮어쓰면 이력과 어긋난다(#285).
    db.prepare(`
      UPDATE debts SET name=?, balance=?, type=?, memo=?,
        loan_type=?, credit_limit=?, interest_basis=?, compounds=?, interest_day=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(merged.name, merged.balance, merged.type || '일반', merged.memo || null,
           merged.loan_type || 'general', merged.credit_limit ?? null,
           merged.interest_basis || null,
           merged.compounds === null || merged.compounds === undefined ? null : asInt(merged.compounds),
           merged.interest_day ?? null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// DELETE /api/debts/:id
router.delete('/:id', (req, res) => {
  // 파생 이자 거래 → 이자 이력 → 부채 순으로 지운다. 이력을 먼저 지우면
  // 어떤 거래가 이 부채 것이었는지 찾을 방법이 없어져 고아 행이 남는다(#269).
  let deleted = 0;
  const tx = db.transaction(() => {
    deleted = deleteDebtDerived(db, Number(req.params.id))
      + deleteDebtRepaymentDerived(db, Number(req.params.id));
    db.prepare('DELETE FROM debt_interest_log WHERE debt_id=?').run(req.params.id);
    db.prepare('DELETE FROM debt_repayments WHERE debt_id=?').run(req.params.id);
    db.prepare('DELETE FROM debts WHERE id=?').run(req.params.id);
  });
  tx();
  res.json({ ok: true, derived: { deleted } });
});

// POST /api/debts/:id/interest — 이자 추가 (잔액 자동 반영)
router.post('/:id/interest', numericBody(['interest_amount']), (req, res) => {
  try {
    const debt = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!debt) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });

    const { rate, interest_amount, log_date, memo } = req.body;
    if (rate === undefined || interest_amount === undefined || !log_date) {
      return res.status(400).json({ error: '이자율, 이자 금액, 기록일은 필수입니다.' });
    }
    // rate 는 REAL 이라 정수 전용 numericBody 로 막을 수 없다. 연 4.17% 같은
    // 실제 금리가 거부되던 자리다(#285 에서 발견).
    const rateInvalid = validateAnnualRate(rate);
    if (rateInvalid) return res.status(400).json({ error: rateInvalid });
    // FND-06(감사): interest_amount가 문자열이면 balance_after 산술이 문자열
    // 연결로 동작해 부채 잔액이 오염될 수 있었다. INTEGER 컬럼이라 asInt로 강제한다.
    const interestAmount = asInt(interest_amount);
    if (interestAmount === null) return res.status(400).json({ error: '이자 금액은 정수로 입력해 주세요.' });

    const balance_before = debt.balance;
    const balance_after = balance_before + interestAmount;

    let derived = { created: 0 };
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, log_date, rate, interestAmount, balance_before, balance_after, memo || null);

      db.prepare(`
        UPDATE debts SET balance=?, annual_rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(balance_after, rate, req.params.id);

      // 이자 기록이 거래 1건을 만든다(#269). 기록·잔액·거래가 한 트랜잭션이다.
      derived = createDebtInterestDerived(db, Number(info.lastInsertRowid));
    });
    tx();

    res.status(201).json({ ok: true, balance_after, derived });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// GET /api/debts/:id/interest-log — 이자 이력 조회
router.get('/:id/interest-log', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT * FROM debt_interest_log WHERE debt_id = ? ORDER BY log_date DESC, id DESC
    `).all(req.params.id);
    res.json({ data });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// GET /api/debts/:id/derived — 이 부채가 만든 이자 거래 목록(#270).
router.get('/:id/derived', (req, res) => {
  try {
    res.json({ data: derivedRowsForDebt(db, Number(req.params.id)) });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// GET /api/debts/:id/repayments — 부분상환 이력(#287)
router.get('/:id/repayments', (req, res) => {
  try {
    res.json({ data: listRepayments(db, Number(req.params.id)) });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// POST /api/debts/:id/repayments — 부분상환 기록(#287)
//
// 잔액을 직접 고치는 대신 여기를 거치게 하는 것이 이 이슈의 요점이다. 직접 고치면
// 언제 얼마를 갚았는지가 남지 않아 과거 이자를 재계산할 수 없다.
router.post('/:id/repayments', numericBody(['amount', 'principal_portion', 'interest_portion']), (req, res) => {
  try {
    const debt = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!debt) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });

    const payload = {
      amount: asInt(req.body.amount),
      repaid_on: req.body.repaid_on,
      memo: req.body.memo || null,
      principal_portion: req.body.principal_portion === undefined
        ? undefined : asInt(req.body.principal_portion),
      interest_portion: req.body.interest_portion === undefined
        ? undefined : asInt(req.body.interest_portion),
    };
    const invalid = validateRepayment(payload);
    if (invalid) return res.status(400).json({ error: invalid });

    // 이력·잔액·거래가 한 덩어리다. 중간에 실패하면 잔액만 줄고 기록이 없거나
    // 그 반대가 된다.
    let result;
    let derived = { created: 0 };
    db.transaction(() => {
      result = recordRepayment(db, Number(req.params.id), payload);
      derived = createRepaymentDerived(db, result.id);
    })();

    res.status(201).json({ ok: true, ...result, derived });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// DELETE /api/debts/:id/repayments/:repaymentId — 상환 기록 삭제
//
// 부채 id 를 경로에 넣는 이유는 '/repayments/:id' 로 두면 위의 DELETE '/:id' 가
// 'repayments' 를 부채 id 로 잡아먹기 때문이다. 세 마디짜리 경로는 그 라우트와
// 겹치지 않는다.
router.delete('/:id/repayments/:repaymentId', (req, res) => {
  try {
    let removed;
    let derivedDeleted = 0;
    db.transaction(() => {
      derivedDeleted = deleteDerivedFor(db, 'debt_repayments', Number(req.params.repaymentId));
      removed = deleteRepayment(db, Number(req.params.repaymentId));
    })();

    if (!removed) return res.status(404).json({ error: '찾는 상환 기록이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true, restored: removed.principal_portion, derived: { deleted: derivedDeleted } });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// GET /api/debts/:id/interest-projection?from=&to= — 마이너스통장 이자 계산(#286)
//
// **읽기 전용이다. DB 를 바꾸지 않는다.** 이자를 실제로 기록하는 것은 여전히
// POST /:id/interest 이고, 여기서는 "이 기간에 얼마가 붙는가" 만 보여준다.
// ADR 0008 이 읽기 전용 계산을 프리뷰 대상에서 제외한 것과 같은 성격이다.
router.get('/:id/interest-projection', (req, res) => {
  try {
    const debt = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!debt) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });

    const { from, to } = req.query;
    if (!isYMD(from) || !isYMD(to)) {
      return res.status(400).json({ error: '조회할 기간을 선택해 주세요.' });
    }
    if (from >= to) {
      return res.status(400).json({ error: '시작일이 종료일보다 늦습니다. 날짜를 확인해 주세요.' });
    }

    const settings = settingsFor(debt);
    if (settings.interest_basis !== 'daily') {
      // general 은 월 단위 어림값이라 구간 계산이 성립하지 않는다. 없는 정밀도를
      // 만들어 내지 않고 사실대로 거부한다.
      return res.status(400).json({
        error: '이 부채는 기간별 이자 계산을 지원하지 않아요. 마이너스통장으로 등록하면 계산할 수 있어요.',
      });
    }

    const strategy = strategyFor(settings.loan_type);
    const result = strategy.simulate({
      balanceTimeline: balanceTimeline(db, Number(req.params.id), debt.balance),
      rateTimeline: rateTimeline(db, Number(req.params.id), from, to),
      from,
      to,
      interestDay: debt.interest_day || null,
      compounds: settings.compounds === 1,
      creditLimit: settings.credit_limit,
    });
    res.json({ data: result });
  } catch (e) {
    if (e && e.name === 'MissingRateError') {
      return res.status(400).json({ error: e.message });
    }
    serverError(res, e, 'debts');
  }
});

function isYMD(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// GET /api/debts/:id/rates — 금리 이력(#285)
router.get('/:id/rates', (req, res) => {
  try {
    res.json({ data: listRates(db, Number(req.params.id)) });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// POST /api/debts/:id/rates — 금리 변경. 열린 구간을 닫고 새 구간을 연다.
//
// 변동금리(3개월 주기 등)를 통보받을 때마다 여기로 넣는다. 과거 이자를 그 시점
// 금리로 계산할 수 있어야 하므로 debts.annual_rate 를 덮어쓰는 방식은 쓰지 않는다.
router.post('/:id/rates', (req, res) => {
  try {
    const debt = db.prepare('SELECT id FROM debts WHERE id=?').get(req.params.id);
    if (!debt) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });

    const payload = {
      annual_rate: Number(req.body.annual_rate),
      effective_from: req.body.effective_from,
      memo: req.body.memo || null,
    };
    const invalid = validateRateChange(payload);
    if (invalid) return res.status(400).json({ error: invalid });

    const result = setDebtRate(db, Number(req.params.id), payload);
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// GET /api/debts/:id/rate-on?date=YYYY-MM-DD — 그 시점에 적용되던 금리
router.get('/:id/rate-on', (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: '조회할 날짜를 선택해 주세요.' });
    }
    res.json({ data: rateAt(db, Number(req.params.id), date) });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// 금리는 소수를 허용해야 한다(연 4.17%). numericBody 는 정수 전용이라 여기서
// 직접 막는다 — services/cardPolicy.js 의 annual_rate 검증과 같은 이유다.
//
// NaN 은 비교 연산이 전부 false 라 범위 검사만으로는 통과해버린다. 유한수인지 먼저 본다.
function validateAnnualRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const rate = Number(value);
  if (!Number.isFinite(rate)) return '이자율을 숫자로 입력해 주세요.';
  if (rate < 0 || rate > 100) return '이자율은 0에서 100 사이로 입력해 주세요.';
  return null;
}

// 로컬 기준 오늘. UTC 를 쓰면 자정~오전 9시에 하루가 밀린다(utils/date.js 와 같은 이유).
function todayYMD() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = router;
