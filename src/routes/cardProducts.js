'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody, missingFields } = require('../utils/validate');
const { CARD_TYPES } = require('../constants');

// 보유 카드(카드상품) CRUD(#306).
//
// payment_methods 는 카드사 단위로 남고, 그 아래에 상품이 붙는다. 한 카드사가
// 여러 상품을 가질 수 있으므로 payment_method_id 에 UNIQUE 를 걸지 않는다.

// 숫자 필드는 인라인 배열로 적는다. 상수로 빼면 test/numericValidation.test.js 의
// 선언 수집기(정규식)가 못 잡아 대장에서 사라진다 — 검증을 빠뜨렸는지 세는
// 장치인데 선언이 안 보이면 목적이 없어진다.

function validate(body) {
  const missing = missingFields(body, ['payment_method_id', 'issuer', 'product_name', 'card_type']);
  if (missing.length) {
    return `카드사, 상품명, 카드 종류를 모두 입력해 주세요.`;
  }
  if (!CARD_TYPES.includes(body.card_type)) {
    // 내부 값을 그대로 노출하지 않는다 — 사용자가 고를 수 있는 말로 돌려준다.
    return `카드 종류는 ${CARD_TYPES.join(' 또는 ')} 중에서 골라 주세요.`;
  }
  const pm = db.prepare('SELECT id FROM payment_methods WHERE id=?').get(body.payment_method_id);
  if (!pm) return '선택한 카드사를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.';
  return null;
}

function normalize(body) {
  return {
    payment_method_id: body.payment_method_id,
    issuer: body.issuer,
    product_name: body.product_name,
    card_type: body.card_type,
    annual_fee: body.annual_fee ?? 0,
    memo: body.memo || null,
  };
}

// GET /api/card-products?payment_method_id=
router.get('/', (req, res) => {
  try {
    const { payment_method_id } = req.query;
    const rows = payment_method_id
      ? db.prepare(`
          SELECT cp.*, p.name AS payment_method_name
          FROM card_products cp
          LEFT JOIN payment_methods p ON p.id = cp.payment_method_id
          WHERE cp.payment_method_id = ?
          ORDER BY cp.issuer, cp.product_name
        `).all(payment_method_id)
      : db.prepare(`
          SELECT cp.*, p.name AS payment_method_name
          FROM card_products cp
          LEFT JOIN payment_methods p ON p.id = cp.payment_method_id
          ORDER BY cp.issuer, cp.product_name
        `).all();
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

// 아직 어느 카드인지 정하지 않은 거래 수(#306). 사용자가 재매핑을 언제 끝냈는지
// 알 수 있어야 하고, 카드 전략 계산이 무엇을 제외했는지 화면이 밝혀야 한다.
router.get('/unassigned-count', (_req, res) => {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM transactions t
      LEFT JOIN payment_methods p ON p.id = t.payment_method_id
      WHERE t.card_product_id IS NULL AND p.type = '신용'
    `).get();
    res.json({ unassigned: row.cnt });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

router.post('/', numericBody(['payment_method_id', 'annual_fee']), (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const p = normalize(req.body);
    const info = db.prepare(`
      INSERT INTO card_products
        (payment_method_id, issuer, product_name, card_type, annual_fee, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(p.payment_method_id, p.issuer, p.product_name, p.card_type, p.annual_fee, p.memo);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '같은 카드사에 같은 이름의 카드가 이미 있어요.' });
    }
    serverError(res, e, 'cardProducts');
  }
});

router.put('/:id', numericBody(['payment_method_id', 'annual_fee']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM card_products WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 카드가 없습니다. 이미 삭제됐을 수 있어요.' });

    const merged = { ...existing, ...req.body };
    const err = validate(merged);
    if (err) return res.status(400).json({ error: err });

    const p = normalize(merged);
    db.prepare(`
      UPDATE card_products
      SET payment_method_id=?, issuer=?, product_name=?, card_type=?, annual_fee=?, memo=?
      WHERE id=?
    `).run(p.payment_method_id, p.issuer, p.product_name, p.card_type, p.annual_fee, p.memo, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '같은 카드사에 같은 이름의 카드가 이미 있어요.' });
    }
    serverError(res, e, 'cardProducts');
  }
});

// 삭제해도 거래는 남는다. card_product_id 가 NULL 로 돌아가 "미상" 이 될 뿐이다 —
// 거래를 지우면 가계부 기록이 사라지므로 그럴 수 없다.
router.delete('/:id', (req, res) => {
  try {
    const affected = db.prepare(
      'SELECT COUNT(*) AS cnt FROM transactions WHERE card_product_id=?'
    ).get(req.params.id).cnt;

    db.transaction(() => {
      db.prepare('UPDATE transactions SET card_product_id=NULL WHERE card_product_id=?').run(req.params.id);
      db.prepare('DELETE FROM card_products WHERE id=?').run(req.params.id);
    })();

    res.json({ ok: true, unassigned: affected });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

module.exports = router;
