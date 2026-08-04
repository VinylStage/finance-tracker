'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { numericBody, missingFields } = require('../utils/validate');
const { serverError } = require('../utils/errors');
const { BENEFIT_TYPES } = require('../constants');

// 카드 혜택 CRUD(#274).
//
// 혜택은 카드 상품에 딸린다. category_id 가 NULL 이면 전 가맹점, merchant_pattern
// 이 NULL 이면 그 카테고리 전체다. 둘 다 NULL 이면 "뭘 사도 N%" 를 뜻한다.
//
// 시장 전체 카드 비교는 범위 밖이다 — 상품 정보를 주는 공식 API 가 없고 크롤링은
// 약관·정확성 양쪽에서 믿을 수 없다. 사용자가 자기 카드를 직접 넣는다.

// 숫자 필드는 인라인 배열로 적는다. 상수로 빼면 test/numericValidation.test.js 의
// 선언 수집기(정규식)가 못 잡아 대장에서 사라진다 — 검증을 빠뜨렸는지 세는
// 장치인데 선언이 안 보이면 목적이 없어진다.

function blankToNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function validate(body) {
  const missing = missingFields(body, ['card_product_id', 'benefit_type', 'rate']);
  if (missing.length) return '카드, 혜택 종류, 비율을 모두 입력해 주세요.';

  if (!BENEFIT_TYPES.includes(body.benefit_type)) {
    // 내부 값을 그대로 노출하지 않는다 — 사용자가 고를 수 있는 말로 돌려준다.
    return `혜택 종류는 ${BENEFIT_TYPES.join(' 또는 ')} 중에서 골라 주세요.`;
  }

  // 0% 도 100% 도 유효한 값이다. 0 은 "이 카테고리에는 혜택 없음" 을 명시적으로
  // 적어 두는 쓰임이 있다 — 안 적은 것과 없다고 적은 것은 다르다.
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return '혜택 비율은 0에서 100 사이로 입력해 주세요.';
  }

  for (const [key, label] of [['monthly_cap', '월 한도'], ['min_amount', '건당 최소 결제액']]) {
    const v = body[key];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return `${label}은 0 이상이어야 합니다.`;
  }

  const card = db.prepare('SELECT id FROM card_products WHERE id=?').get(body.card_product_id);
  if (!card) return '선택한 카드를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.';

  if (body.category_id !== undefined && body.category_id !== null && body.category_id !== '') {
    const cat = db.prepare('SELECT id FROM categories WHERE id=?').get(body.category_id);
    if (!cat) return '선택한 카테고리를 찾을 수 없습니다.';
  }
  return null;
}

function normalize(body) {
  return {
    card_product_id: Number(body.card_product_id),
    category_id: blankToNull(body.category_id),
    merchant_pattern: body.merchant_pattern || null,
    benefit_type: body.benefit_type,
    rate: Number(body.rate),
    monthly_cap: blankToNull(body.monthly_cap),
    // 안 적으면 조건 없음이다. NULL 로 두면 비교할 때마다 NULL 처리를 해야 한다.
    min_amount: blankToNull(body.min_amount) ?? 0,
    memo: body.memo || null,
  };
}

// GET /api/card-benefits?card_product_id=
router.get('/', (req, res) => {
  try {
    const { card_product_id } = req.query;
    const sql = `
      SELECT b.*, c.name AS category_name, cp.product_name, cp.issuer
      FROM card_benefits b
      LEFT JOIN categories c ON c.id = b.category_id
      LEFT JOIN card_products cp ON cp.id = b.card_product_id
    `;
    const rows = card_product_id
      ? db.prepare(`${sql} WHERE b.card_product_id = ? ORDER BY b.rate DESC, b.id`).all(card_product_id)
      : db.prepare(`${sql} ORDER BY cp.issuer, cp.product_name, b.rate DESC`).all();
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'cardBenefits');
  }
});

router.post('/', numericBody(['card_product_id', 'category_id', 'monthly_cap', 'min_amount']), (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const b = normalize(req.body);
    const info = db.prepare(`
      INSERT INTO card_benefits
        (card_product_id, category_id, merchant_pattern, benefit_type, rate, monthly_cap, min_amount, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.card_product_id, b.category_id, b.merchant_pattern, b.benefit_type,
           b.rate, b.monthly_cap, b.min_amount, b.memo);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    serverError(res, e, 'cardBenefits');
  }
});

router.put('/:id', numericBody(['card_product_id', 'category_id', 'monthly_cap', 'min_amount']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM card_benefits WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 혜택이 없습니다. 이미 삭제됐을 수 있어요.' });

    // 보내지 않은 필드는 기존 값을 잇는다. 일부만 보내는 호출부가 안 보낸 값을
    // 기본값으로 덮으면 사용자가 적어 둔 한도나 최소 결제액이 조용히 사라진다.
    const merged = { ...existing, ...req.body };
    const err = validate(merged);
    if (err) return res.status(400).json({ error: err });

    const b = normalize(merged);
    db.prepare(`
      UPDATE card_benefits
      SET card_product_id=?, category_id=?, merchant_pattern=?, benefit_type=?,
          rate=?, monthly_cap=?, min_amount=?, memo=?
      WHERE id=?
    `).run(b.card_product_id, b.category_id, b.merchant_pattern, b.benefit_type,
           b.rate, b.monthly_cap, b.min_amount, b.memo, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardBenefits');
  }
});

// 혜택은 실제로 지운다. 카드·결제수단과 달리 지난 기록으로서의 값이 없다 —
// 거래가 참조하지도 않는다. 소프트 삭제를 두면 목록에서 걸러야 할 상태만 는다.
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM card_benefits WHERE id=?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: '찾는 혜택이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardBenefits');
  }
});

module.exports = router;
