'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { numericBody, missingFields } = require('../utils/validate');
const { serverError } = require('../utils/errors');
const { BENEFIT_TYPES, PAYMENT_STYLES } = require('../constants');
const { validateRule, ruleOf, RATE_KIND } = require('../services/benefitRules');

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

  // 유형별 혜택 규칙(#564). 안 보내면 요율형으로 간주하므로 통과다.
  //
  // 모르는 유형을 여기서 막는다. `flat_montly` 같은 오타가 저장되면 계산이
  // 조용히 0 원이 되고, 사용자는 혜택이 왜 안 잡히는지 알 수 없다.
  const ruleError = validateRule(body.rule);
  if (ruleError) return ruleError;

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
  // 실적 구간 연결(#563). 안 적으면 구간을 가리지 않는다.
  if (body.card_threshold_tier_id !== undefined && body.card_threshold_tier_id !== null
      && body.card_threshold_tier_id !== '') {
    const tier = db.prepare('SELECT card_product_id FROM card_threshold_tiers WHERE id=?')
      .get(body.card_threshold_tier_id);
    if (!tier) return '선택한 실적 구간을 찾을 수 없습니다.';
    // 남의 카드 구간에 혜택을 걸면 그 혜택은 영영 안 걸린다 — 조용히 죽는다.
    if (Number(tier.card_product_id) !== Number(body.card_product_id)) {
      return '실적 구간이 이 카드의 것이 아닙니다.';
    }
  }

  // 결제방식 제약(#563). 안 적으면 결제방식을 가리지 않는다 — 그게 기본이다.
  if (body.payment_style !== undefined && body.payment_style !== null && body.payment_style !== '') {
    if (!PAYMENT_STYLES.includes(body.payment_style)) {
      return `결제방식은 ${PAYMENT_STYLES.join(' 또는 ')} 중에서 골라 주세요.`;
    }
  }
  return null;
}

function normalize(body) {
  // 규칙을 먼저 정한다. `rate` 가 그 결과에 딸리기 때문이다(#571).
  //
  // `PUT` 은 `{...existing, ...body}` 를 넘긴다. 규칙을 안 보낸 부분 수정에서
  // 여기가 무조건 NULL 을 내면 **적어 둔 규칙이 조용히 지워진다.** 그래서
  // 세 갈래로 나눈다 — 새 규칙을 보냈으면 그것, 명시적 null 이면 지우기,
  // 아무것도 안 보냈으면 기존 값 유지.
  const rule_json = body.rule !== undefined
    ? (body.rule === null ? null : JSON.stringify(body.rule))
    : (body.rule_json ?? null);

  // 요율형이 아니면 `rate` 를 0 으로 눌러 저장한다.
  //
  // 안 누르면 `rate: 5.0` 과 정액구간형 규칙이 한 행에 같이 앉는다. 지금은
  // 읽는 쪽이 규칙을 먼저 보므로 `rate` 가 죽어 있어 계산이 맞다. 문제는
  // **나중에 그 규칙을 지웠을 때**다. `ruleOf()` 가 `rate` 컬럼으로 되돌아가면서
  // 묻혀 있던 5% 가 되살아난다 — 사용자는 규칙 하나를 지웠을 뿐인데 없던 혜택이
  // 붙는다. 화면은 이미 0 을 보내지만 API·스크립트 경로가 열려 있다.
  //
  // 판정을 여기서 따로 하지 않고 `ruleOf` 에 맡긴다. "이 행이 무슨 유형인가" 를
  // 읽는 쪽과 쓰는 쪽이 각자 판단하면 두 답이 갈라진다.
  const rate = ruleOf({ rule_json, rate: body.rate }).kind === RATE_KIND
    ? Number(body.rate)
    : 0;

  return {
    card_product_id: Number(body.card_product_id),
    category_id: blankToNull(body.category_id),
    merchant_pattern: body.merchant_pattern || null,
    benefit_type: body.benefit_type,
    rate,
    monthly_cap: blankToNull(body.monthly_cap),
    // 안 적으면 조건 없음이다. NULL 로 두면 비교할 때마다 NULL 처리를 해야 한다.
    min_amount: blankToNull(body.min_amount) ?? 0,
    memo: body.memo || null,
    // 비우면 결제방식 무관이다. 넣은 혜택에만 제약이 걸린다(#563).
    payment_style: body.payment_style || null,
    // 비우면 구간 무관이다(#563).
    card_threshold_tier_id: blankToNull(body.card_threshold_tier_id),
    // 유형별 혜택 규칙(#564). 안 보내면 NULL 이고, 읽는 쪽이 `rate` 컬럼을 보고
    // 요율형으로 간주한다 — 이미 들어가 있는 혜택이 이 변경으로 달라지지 않는다.
    rule_json,
    // 실적 조건이 붙지 않는 혜택인가(#636). 안 보내면 0 — «조건이 붙는다» 가
    // 기본이다. 카드 약관이 «실적 조건 없는 서비스» 라고 따로 밝힌 것만 1 이다.
    threshold_exempt: body.threshold_exempt ? 1 : 0,
  };
}

// 목록 정렬(#571).
//
// 예전에는 `rate DESC` 하나였다. 요율만 있던 시절에는 그것이 "큰 혜택 먼저" 의
// 대리값이었다. 유형이 늘면서 그 대리값이 깨졌다 — 정액구간형은 `rate` 가 0 이라
// **값과 무관하게 맨 아래로 간다.** 매달 7,000원 붙는 혜택이 0.5% 짜리 아래에 놓인다.
//
// 유형을 가로질러 크기를 비교하지는 않는다. 정액 3,000원과 요율 0.7% 중 무엇이
// 큰지는 거래금액을 알아야 정해지고, 목록은 그것을 모른다. 대신 **유형끼리 묶는다.**
// 요율형은 예전 그대로 요율 순으로 줄 세우고, 그렇지 않은 유형은 그 뒤에 모인다.
// 맨 아래에 있는 것이 "0% 라서" 가 아니라 "다른 유형이라서" 가 된다.
//
// 규칙이 없는 행(이미 들어가 있는 혜택 전부)은 요율형이므로 순서가 달라지지 않는다.
//
// `b.id` 를 끝에 둔다. 전체 조회에는 이게 없어서 같은 요율이 여럿일 때 순서가
// 호출마다 달라질 수 있었다 — 실 데이터에 5.0% 가 24건이다.
const BY_SIZE = `
  CASE WHEN b.rule_json IS NULL OR json_extract(b.rule_json, '$.kind') = 'rate'
       THEN 0 ELSE 1 END,
  b.rate DESC,
  b.id
`;

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
      ? db.prepare(`${sql} WHERE b.card_product_id = ? ORDER BY ${BY_SIZE}`).all(card_product_id)
      : db.prepare(`${sql} ORDER BY cp.issuer, cp.product_name, ${BY_SIZE}`).all();
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'cardBenefits');
  }
});

router.post('/', numericBody(['card_product_id', 'category_id', 'monthly_cap', 'min_amount', 'card_threshold_tier_id']), (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const b = normalize(req.body);
    const info = db.prepare(`
      INSERT INTO card_benefits
        (card_product_id, category_id, merchant_pattern, benefit_type, rate, monthly_cap, min_amount, memo, payment_style, card_threshold_tier_id, rule_json, threshold_exempt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.card_product_id, b.category_id, b.merchant_pattern, b.benefit_type,
           b.rate, b.monthly_cap, b.min_amount, b.memo, b.payment_style,
           b.card_threshold_tier_id, b.rule_json, b.threshold_exempt);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    serverError(res, e, 'cardBenefits');
  }
});

router.put('/:id', numericBody(['card_product_id', 'category_id', 'monthly_cap', 'min_amount', 'card_threshold_tier_id']), (req, res) => {
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
          rate=?, monthly_cap=?, min_amount=?, memo=?, payment_style=?,
          card_threshold_tier_id=?, rule_json=?, threshold_exempt=?
      WHERE id=?
    `).run(b.card_product_id, b.category_id, b.merchant_pattern, b.benefit_type,
           b.rate, b.monthly_cap, b.min_amount, b.memo, b.payment_style,
           b.card_threshold_tier_id, b.rule_json, b.threshold_exempt, req.params.id);
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
