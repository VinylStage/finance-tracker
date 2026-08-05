'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody, missingFields } = require('../utils/validate');
const { CARD_TYPES } = require('../constants');
const { billingMonthInfo } = require('../services/cardBilling');
const { planRemap, applyRemap, countUnassigned } = require('../services/cardRemap');
const { setAuditLabel } = require('../utils/auditContext');

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

  // 청구 주기(#274). 모르면 비워 두는 것이 맞다 — 모르는 값을 1 이나 0 으로
  // 채우면 전월 실적과 청구월 계산이 틀린 답을 자신 있게 낸다.
  for (const key of ['billing_cycle_day', 'statement_close_day']) {
    const v = body[key];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return '결제일과 마감일은 1일에서 31일 사이로 입력해 주세요.';
    }
  }
  if (body.prev_month_threshold !== undefined && body.prev_month_threshold !== null
      && body.prev_month_threshold !== '') {
    const n = Number(body.prev_month_threshold);
    if (!Number.isFinite(n) || n < 0) return '전월 실적 기준액은 0 이상이어야 합니다.';
  }
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
    // 빈 문자열을 그대로 넣으면 숫자 컬럼에 '' 이 저장돼 이후 비교가 전부 어긋난다.
    prev_month_threshold: blankToNull(body.prev_month_threshold),
    billing_cycle_day: blankToNull(body.billing_cycle_day),
    statement_close_day: blankToNull(body.statement_close_day),
  };
}

function blankToNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET /api/card-products?payment_method_id=&include_inactive=1
//
// 기본은 **활성 카드만** 준다. 비활성 카드는 새 거래에서 고를 수 없기 때문이다.
// 다만 과거 거래가 그 카드를 가리키고 있으므로, 그 거래를 보여주거나 수정하는
// 화면은 include_inactive 로 함께 받아야 한다 — 목록에 없으면 화면이 선택을
// 비우고, 저장하는 순간 지정이 지워진다.
//
// /api/payment-methods 가 같은 규약을 쓴다.
router.get('/', (req, res) => {
  try {
    const { payment_method_id, include_inactive } = req.query;
    const where = [];
    const params = [];
    if (payment_method_id) { where.push('cp.payment_method_id = ?'); params.push(payment_method_id); }
    if (!include_inactive) where.push('cp.is_active = 1');

    const rows = db.prepare(`
      SELECT cp.*, p.name AS payment_method_name
      FROM card_products cp
      LEFT JOIN payment_methods p ON p.id = cp.payment_method_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY cp.issuer, cp.product_name
    `).all(...params);
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

// 아직 어느 카드인지 정하지 않은 거래 수(#306). 사용자가 재매핑을 언제 끝냈는지
// 알 수 있어야 하고, 카드 전략 계산이 무엇을 제외했는지 화면이 밝혀야 한다.
router.get('/unassigned-count', (_req, res) => {
  try {
    res.json({ unassigned: countUnassigned(db) });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

// POST /api/card-products/remap/preview — 무엇이 몇 건 바뀌는지 계산한다.
//
// **DB 를 바꾸지 않는다**(ADR 0008). 조건을 고칠 때마다 화면이 이 엔드포인트를
// 다시 부르므로, 여기서 쓰기가 한 번이라도 일어나면 사용자가 범위를 좁혀 보는
// 동안 데이터가 계속 바뀐다.
router.post('/remap/preview', numericBody(['card_product_id', 'min_amount', 'max_amount']), (req, res) => {
  try {
    const plan = planRemap(db, req.body || {});
    if (plan.error) return res.status(400).json({ error: plan.error });

    res.json({
      target: plan.target,
      count: plan.count,
      already_assigned: plan.already_assigned,
      samples: plan.samples,
      preview_token: plan.fingerprint,
      remaining_unassigned: countUnassigned(db),
      // 실행취소로 되돌릴 수 있는지 알린다(ADR 0008 의 프리뷰 요건). 감사
      // 트리거가 UPDATE 를 행마다 잡고 한 action_id 로 묶으므로 되돌아간다.
      undoable: true,
    });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

// POST /api/card-products/remap — 확인한 뒤에만 쓴다.
//
// 프리뷰 지문을 요구한다. 화면에서만 막고 엔드포인트가 열려 있으면 원칙이
// 반쪽이 된다(ADR 0008 의 "지켜지지 않을 수 있는 지점").
router.post('/remap', numericBody(['card_product_id', 'min_amount', 'max_amount']), (req, res) => {
  try {
    const { preview_token } = req.body || {};
    const plan = planRemap(db, req.body || {});
    if (plan.error) return res.status(400).json({ error: plan.error });

    if (!preview_token) {
      return res.status(428).json({
        error: '무엇이 바뀌는지 먼저 확인해 주세요. 미리보기를 거쳐야 옮길 수 있어요.',
        preview_required: true,
      });
    }
    if (preview_token !== plan.fingerprint) {
      return res.status(409).json({
        error: '미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 옮겨 주세요.',
        preview_stale: true,
      });
    }

    // 라벨이 없으면 감사 이력에 "무엇을 했는지" 가 안 남는다. 260건짜리 작업이
    // 이름 없이 묶여 있으면 되돌릴지 판단할 근거가 없다(#298).
    setAuditLabel(`카드 재매핑 → ${plan.target.product_name}`);
    const updated = applyRemap(db, plan);

    // 실행 후 결과를 다시 알린다(ADR 0008). 남은 미상 건수는 사용자가 언제
    // 끝났는지 아는 유일한 지표다 — 부분 완료가 정상 상태이기 때문이다.
    res.json({
      ok: true,
      updated,
      remaining_unassigned: countUnassigned(db),
      target: plan.target,
    });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

// GET /api/card-products/billing-month?payment_method_id=&purchase_date=
//
// 구매일이 실리는 청구월을 돌려준다(#364). 할부 등록 폼이 「청구 시작월」 기본값을
// 채우는 데 쓴다 — 지금은 이번 달이 박혀 있어서, 7/28 구매인데 마감이 7/25 인
// 카드면 두 달 어긋난 채로 회차 전체가 생성된다.
//
// **결제수단에 카드 상품이 여럿일 수 있다.** 상품마다 청구 주기가 다르면 어느
// 것을 쓸지 알 수 없다. 그때는 추측하지 않고 미해결로 돌려준다 — 청구월을
// 잘못 옮기면 사용자가 보기에 지출이 이유 없이 다른 달에 가 있다.
//
// '/:id' 보다 먼저 선언해야 한다. 뒤에 두면 'billing-month' 가 id 로 잡힌다.
router.get('/billing-month', (req, res) => {
  try {
    const { payment_method_id, purchase_date } = req.query;
    if (!purchase_date) {
      return res.status(400).json({ error: '구매일을 지정해 주세요.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchase_date)) {
      return res.status(400).json({ error: '구매일은 YYYY-MM-DD 형식이어야 합니다.' });
    }

    let card = null;
    let ambiguous = false;
    if (payment_method_id) {
      const rows = db.prepare(`
        SELECT id, product_name, billing_cycle_day, statement_close_day
        FROM card_products
        WHERE payment_method_id = ?
          AND is_active = 1
          AND billing_cycle_day IS NOT NULL
          AND statement_close_day IS NOT NULL
      `).all(Number(payment_method_id));

      const distinct = new Set(rows.map((r) => `${r.billing_cycle_day}/${r.statement_close_day}`));
      if (rows.length === 1 || distinct.size === 1) card = rows[0] || null;
      else if (rows.length > 1) ambiguous = true;
    }

    const info = billingMonthInfo(purchase_date, card);
    res.json({
      data: {
        billing_month: info.billingMonth,
        // 청구 주기를 알고 계산했는가. false 면 구매일의 달력 월로 폴백한 것이고,
        // 화면은 그 사실을 밝혀야 한다.
        resolved: info.resolved,
        // 주기가 서로 다른 상품이 여럿이라 고를 수 없었는가.
        ambiguous,
        card_product: card ? { id: card.id, product_name: card.product_name } : null,
      },
    });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

router.post('/', numericBody(['payment_method_id', 'annual_fee', 'prev_month_threshold', 'billing_cycle_day', 'statement_close_day']), (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const p = normalize(req.body);

    // 같은 카드사에 같은 이름의 카드가 이미 있으면 새로 만들지 않는다.
    // UNIQUE 인덱스가 어차피 막지만, **비활성인 경우를 구분해서** 알려줘야
    // 화면이 "이미 등록된 카드예요. 다시 쓰시겠어요?" 를 물을 수 있다.
    // 그냥 409 만 주면 사용자는 목록에 없는 카드 때문에 등록이 막힌 이유를
    // 알 수 없다 — 비활성 카드는 목록에 안 보이기 때문이다.
    const dup = db.prepare(
      'SELECT id, is_active FROM card_products WHERE payment_method_id=? AND product_name=?'
    ).get(p.payment_method_id, p.product_name);
    if (dup) {
      return res.status(409).json({
        error: dup.is_active
          ? '같은 카드사에 같은 이름의 카드가 이미 있어요.'
          : '전에 등록했다가 더 안 쓰기로 한 카드예요. 다시 쓰시겠어요?',
        duplicate_id: dup.id,
        inactive: !dup.is_active,
        reactivatable: !dup.is_active,
      });
    }

    const info = db.prepare(`
      INSERT INTO card_products
        (payment_method_id, issuer, product_name, card_type, annual_fee, memo,
         prev_month_threshold, billing_cycle_day, statement_close_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.payment_method_id, p.issuer, p.product_name, p.card_type, p.annual_fee, p.memo,
           p.prev_month_threshold, p.billing_cycle_day, p.statement_close_day);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '같은 카드사에 같은 이름의 카드가 이미 있어요.' });
    }
    serverError(res, e, 'cardProducts');
  }
});

router.put('/:id', numericBody(['payment_method_id', 'annual_fee', 'prev_month_threshold', 'billing_cycle_day', 'statement_close_day']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM card_products WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 카드가 없습니다. 이미 삭제됐을 수 있어요.' });

    const merged = { ...existing, ...req.body };
    const err = validate(merged);
    if (err) return res.status(400).json({ error: err });

    const p = normalize(merged);
    db.prepare(`
      UPDATE card_products
      SET payment_method_id=?, issuer=?, product_name=?, card_type=?, annual_fee=?, memo=?,
          prev_month_threshold=?, billing_cycle_day=?, statement_close_day=?
      WHERE id=?
    `).run(p.payment_method_id, p.issuer, p.product_name, p.card_type, p.annual_fee, p.memo,
           p.prev_month_threshold, p.billing_cycle_day, p.statement_close_day, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '같은 카드사에 같은 이름의 카드가 이미 있어요.' });
    }
    serverError(res, e, 'cardProducts');
  }
});

// DELETE /api/card-products/:id — **지우지 않고 비활성화한다**(#410).
//
// 전에는 행을 지우고 거래의 card_product_id 를 NULL 로 되돌렸다. 거래를 지키려는
// 의도였지만 그 결과 NULL 이 "한 번도 지정 안 됨" 과 "지운 카드" 두 가지를
// 뜻하게 됐고, 카드 전략의 되짚기가 후자를 전자로 오해해 **지운 카드의 과거
// 지출을 남은 카드 실적으로 넘겼다.**
//
// 비활성화하면 행이 남아 거래의 참조가 유지된다. 지정을 건드리지 않으므로
// 되짚기 경로로 들어가지도 않고, 되짚기가 도는 경우에도 비활성 카드가 후보에
// 남아 "상품이 딱 하나" 조건이 성립하지 않는다.
//
// 혜택(card_benefits)도 지우지 않는다. 재활성화하면 그대로 돌아와야 한다.
router.delete('/:id', (req, res) => {
  try {
    const card = db.prepare('SELECT id, is_active FROM card_products WHERE id=?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '그 카드를 찾을 수 없어요.' });

    const kept = db.prepare(
      'SELECT COUNT(*) AS cnt FROM transactions WHERE card_product_id=?'
    ).get(req.params.id).cnt;

    db.prepare('UPDATE card_products SET is_active=0 WHERE id=?').run(req.params.id);

    // 몇 건이 그 카드에 남아 있는지 알린다. 화면이 "지웠다" 가 아니라 "더는
    // 고를 수 없게 했고 과거 N건은 그대로 남는다" 를 말할 수 있어야 한다.
    res.json({ ok: true, deactivated: true, kept });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

// POST /api/card-products/:id/reactivate — 다시 고를 수 있게 되돌린다.
//
// 별도 경로로 둔다. PUT 으로 is_active 를 받으면 카드 정보를 고치는 요청이
// 비활성화까지 겸하게 되는데, 그건 사용자가 확인하고 눌러야 하는 동작이다.
router.post('/:id/reactivate', (req, res) => {
  try {
    const card = db.prepare('SELECT id, is_active FROM card_products WHERE id=?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '그 카드를 찾을 수 없어요.' });

    db.prepare('UPDATE card_products SET is_active=1 WHERE id=?').run(req.params.id);
    res.json({ ok: true, reactivated: true });
  } catch (e) {
    serverError(res, e, 'cardProducts');
  }
});

module.exports = router;
