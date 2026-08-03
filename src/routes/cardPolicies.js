'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody, missingFields } = require('../utils/validate');
const {
  validatePolicy, findOverlapping, policyAt, expandRange, validateRange,
} = require('../services/cardPolicy');

// 숫자 필드 선언(#211). 라우트 정의에 붙여 두면 어느 필드에 검증을 빠뜨렸는지
// 소스에서 기계적으로 셀 수 있다.
const NUMERIC = ['payment_method_id', 'months', 'free_from_sequence', 'category_id'];

// GET /api/card-policies?payment_method_id=&months=&on=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const { payment_method_id, months, on } = req.query;
    let sql = `
      SELECT p.*, m.name AS payment_method_name
      FROM card_installment_policies p
      LEFT JOIN payment_methods m ON p.payment_method_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (payment_method_id) { sql += ' AND p.payment_method_id = ?'; params.push(payment_method_id); }
    if (months) { sql += ' AND p.months = ?'; params.push(months); }
    sql += ' ORDER BY p.payment_method_id, p.months, p.effective_from DESC';
    let rows = db.prepare(sql).all(...params);
    // on 이 주어지면 그 시점에 유효한 것만 남긴다.
    if (on) {
      rows = rows.filter((p) => on >= p.effective_from && (!p.effective_to || on <= p.effective_to));
    }
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// GET /api/card-policies/effective?payment_method_id=&months=&on=
// 특정 시점에 유효한 정책 1건. 이자 계산이 쓰는 조회다.
router.get('/effective', (req, res) => {
  try {
    const { payment_method_id, months, on } = req.query;
    const missing = missingFields(req.query, ['payment_method_id', 'months', 'on']);
    if (missing.length) {
      return res.status(400).json({ error: '결제수단, 개월수, 기준일을 모두 지정해 주세요.' });
    }
    const found = policyAt(db, Number(payment_method_id), Number(months), on);
    res.json({ data: found });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// POST /api/card-policies/range — 개월수 구간을 개월수별 행으로 펼쳐 한 번에 등록(#271)
//
// 카드사 안내가 "2~3개월 무이자" 처럼 구간이라 사용자가 개월수를 하나씩 11번
// 입력하게 두면 안 된다. 펼치기를 서버가 하는 이유는 원자성이다 — 화면이 11번
// POST 를 날리면 중간에 겹침으로 막혔을 때 앞부분만 들어간 상태가 남는다.
//
// '/:id' 보다 먼저 선언해야 한다. 뒤에 두면 'range' 가 id 로 잡힌다.
router.post('/range', numericBody(['payment_method_id', 'from_month', 'to_month', 'free_from_sequence', 'category_id']), (req, res) => {
  try {
    const missing = missingFields(req.body, ['payment_method_id', 'from_month', 'to_month', 'policy_type', 'effective_from']);
    if (missing.length) {
      return res.status(400).json({ error: '결제수단, 개월수 구간, 정책 종류, 적용 시작일은 필수입니다.' });
    }
    const rangeError = validateRange(req.body);
    if (rangeError) return res.status(400).json({ error: rangeError });

    const rows = expandRange(req.body);
    for (const p of rows) {
      const invalid = validatePolicy(p);
      if (invalid) return res.status(400).json({ error: invalid });
    }

    // 겹침은 전부 먼저 확인한다. 넣다가 막히면 어디까지 들어갔는지 사용자가 알 수 없다.
    const clashing = rows.filter((p) => findOverlapping(db, p)).map((p) => p.months);
    if (clashing.length) {
      return res.status(409).json({
        error: `${clashing.join(', ')}개월에 적용 기간이 겹치는 정책이 이미 있습니다. 기간이나 개월수 구간을 조정해 주세요.`,
      });
    }

    const insert = db.prepare(`
      INSERT INTO card_installment_policies
        (payment_method_id, months, policy_type, annual_rate, free_from_sequence, effective_from, effective_to, memo, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const p of rows) {
        insert.run(p.payment_method_id, p.months, p.policy_type, p.annual_rate,
                   p.free_from_sequence, p.effective_from, p.effective_to, p.memo, p.category_id);
      }
    })();

    res.status(201).json({ ok: true, created: rows.length });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// DELETE /api/card-policies/range?payment_method_id=&from_month=&to_month=&effective_from=
// 목록에 구간으로 보이는 것을 구간째로 지운다. 화면이 id 를 하나씩 지우면
// 중간에 실패했을 때 구간이 반쪽만 남는다.
router.delete('/range', (req, res) => {
  try {
    const { payment_method_id, from_month, to_month, effective_from } = req.query;
    const missing = missingFields(req.query, ['payment_method_id', 'from_month', 'to_month', 'effective_from']);
    if (missing.length) {
      return res.status(400).json({ error: '지울 구간을 특정할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' });
    }
    const info = db.prepare(`
      DELETE FROM card_installment_policies
      WHERE payment_method_id = ? AND months BETWEEN ? AND ? AND effective_from = ?
    `).run(Number(payment_method_id), Number(from_month), Number(to_month), effective_from);
    res.json({ ok: true, deleted: info.changes });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// POST /api/card-policies
router.post('/', numericBody(NUMERIC), (req, res) => {
  try {
    const p = normalize(req.body);
    const missing = missingFields(req.body, ['payment_method_id', 'months', 'policy_type', 'effective_from']);
    if (missing.length) {
      return res.status(400).json({ error: '결제수단, 개월수, 정책 종류, 적용 시작일은 필수입니다.' });
    }
    const invalid = validatePolicy(p);
    if (invalid) return res.status(400).json({ error: invalid });

    const clash = findOverlapping(db, p);
    if (clash) {
      return res.status(409).json({
        error: '같은 결제수단·개월수에 적용 기간이 겹치는 정책이 이미 있습니다. 기간을 조정해 주세요.',
      });
    }

    const info = db.prepare(`
      INSERT INTO card_installment_policies
        (payment_method_id, months, policy_type, annual_rate, free_from_sequence, effective_from, effective_to, memo, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.payment_method_id, p.months, p.policy_type, p.annual_rate,
           p.free_from_sequence, p.effective_from, p.effective_to, p.memo, p.category_id);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// PUT /api/card-policies/:id
router.put('/:id', numericBody(NUMERIC), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM card_installment_policies WHERE id=?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '찾는 할부 정책이 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    const p = normalize({ ...existing, ...req.body });
    const invalid = validatePolicy(p);
    if (invalid) return res.status(400).json({ error: invalid });

    const clash = findOverlapping(db, p, Number(req.params.id));
    if (clash) {
      return res.status(409).json({
        error: '같은 결제수단·개월수에 적용 기간이 겹치는 정책이 이미 있습니다. 기간을 조정해 주세요.',
      });
    }

    db.prepare(`
      UPDATE card_installment_policies
      SET payment_method_id=?, months=?, policy_type=?, annual_rate=?,
          free_from_sequence=?, effective_from=?, effective_to=?, memo=?, category_id=?
      WHERE id=?
    `).run(p.payment_method_id, p.months, p.policy_type, p.annual_rate,
           p.free_from_sequence, p.effective_from, p.effective_to, p.memo, p.category_id, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// DELETE /api/card-policies/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM card_installment_policies WHERE id=?').run(req.params.id);
    if (!result.changes) {
      return res.status(404).json({ error: '찾는 할부 정책이 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// 입력값을 계산에 쓸 형태로 맞춘다. 문자열 숫자는 numericBody 가 이미 통과시켰으므로
// 여기서는 형만 맞춘다.
function normalize(body) {
  return {
    payment_method_id: Number(body.payment_method_id),
    months: Number(body.months),
    policy_type: body.policy_type,
    annual_rate: body.annual_rate === undefined || body.annual_rate === '' ? 0 : Number(body.annual_rate),
    free_from_sequence: body.free_from_sequence === undefined || body.free_from_sequence === ''
      ? 0 : Number(body.free_from_sequence),
    effective_from: body.effective_from,
    effective_to: body.effective_to || null,
    memo: body.memo || null,
    // null 을 Number() 에 넣으면 0 이 된다. 존재하지 않는 카테고리를 참조하게
    // 되므로 빈 값은 전부 NULL(그 카드사의 기본 정책)로 모은다.
    category_id: body.category_id === undefined || body.category_id === null || body.category_id === ''
      ? null : Number(body.category_id),
  };
}

module.exports = router;
