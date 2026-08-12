'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYearMonth, localYMD } = require('../utils/date');
const { installmentsDueForMonth } = require('../utils/aggregation');
const { numericBody, asInt } = require('../utils/validate');
const { INSTALLMENT_SCHEDULE_FIELDS } = require('../constants');
const {
  planInstallmentDerived, applyInstallmentDerived, derivedRowsFor, deleteDerivedFor,
  PreviewRequiredError, PreviewMismatchError,
} = require('../services/derivedTransactions');
const {
  findDuplicateCandidates, planResolve, dismiss, undismiss, listDismissed,
} = require('../services/installmentDuplicates');
const { estimateBilling, billingBasis } = require('../services/installmentBilling');
const { resolvePolicy } = require('../services/cardPolicy');
const { BILLING_END, STATUS_EXPR } = require('../services/installmentStatus');

// 프리뷰 관련 오류를 상태코드로 옮긴다(ADR 0008).
//
// 428 은 "먼저 확인을 거쳐라", 409 는 "확인한 내용이 이미 낡았다" 다. 둘을 같은
// 400 으로 내리면 화면이 미리보기를 다시 띄워야 할지 그냥 안내만 할지 구분할 수
// 없다. 처리했으면 true 를 돌려준다.
function respondDerivedError(res, e) {
  if (e instanceof PreviewRequiredError) {
    res.status(428).json({ error: e.message, preview_required: true });
    return true;
  }
  if (e instanceof PreviewMismatchError) {
    res.status(409).json({ error: e.message, preview_stale: true });
    return true;
  }
  return false;
}

// 이 수정이 회차를 다시 계산하게 만드는가. 값이 실제로 달라진 것만 센다 —
// 화면이 폼 전체를 그대로 되돌려보내는 경우까지 재생성으로 보면 아무것도 못 고친다.
function changesSchedule(existing, body) {
  return INSTALLMENT_SCHEDULE_FIELDS.some((f) => {
    if (body[f] === undefined) return false;
    const before = existing[f] === null || existing[f] === undefined ? '' : String(existing[f]);
    const after = body[f] === null ? '' : String(body[f]);
    return before !== after;
  });
}

// FND-20(감사): 여기서 쓰던 strftime(...,'now')는 UTC라서 KST 자정~9시 사이엔
// remaining_months/billed_months가 1개월 어긋났다. SQL이 직접 'now'를
// 참조하지 않도록, 현재 연/월을 JS(localYearMonth)에서 계산해 바인딩한다.
//
// 이름 파라미터를 쓴다. 이 조각이 SELECT 안에 두 번 들어가는데 위치 파라미터면
// 같은 값을 네 번 순서대로 넘겨야 하고, 조각이 하나 늘 때마다 그 순서가 어긋난다.
const MONTHS_ELAPSED = `
  (@curYear - CAST(strftime('%Y', i.start_billing_month || '-01') AS INT)) * 12
  + @curMonth - CAST(strftime('%m', i.start_billing_month || '-01') AS INT)
  + 1
`;

// 상태 계산식은 `services/installmentStatus.js` 가 갖는다(#205). 경계 조건을
// 임의 날짜로 검사할 수 있어야 해서 뺐다 — 여기 두면 오늘 날짜로만 검사된다.

// GET /api/installments?status=진행중
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    const [curYear, curMonth] = localYearMonth();
    const params = { curYear, curMonth, today: localYMD() };
    let sql = `
      SELECT i.*,
        p.name AS payment_method_name,
        ${STATUS_EXPR} AS status,
        ${BILLING_END} AS billing_ends_on,
        MAX(0, i.months - (${MONTHS_ELAPSED})) AS remaining_months,
        MIN(i.months, MAX(0, ${MONTHS_ELAPSED})) AS billed_months
      FROM installments i
      LEFT JOIN payment_methods p ON i.payment_method_id = p.id
      WHERE 1=1
    `;
    // 별칭은 WHERE 에서 못 쓴다. 계산식을 그대로 한 번 더 쓴다 — 같은 상수를
    // 참조하므로 한쪽만 고쳐질 일은 없다.
    if (status) { sql += ` AND ${STATUS_EXPR} = @status`; params.status = status; }
    // 정렬도 계산값 기준이다. 별칭은 ORDER BY 에서 쓸 수 있다.
    sql += ' ORDER BY status ASC, i.start_billing_month DESC';
    // 각 할부에 적용되는 정책을 함께 낸다(#500).
    //
    // **정책이 없으면 수수료가 0 으로 계산된다.** 그런데 목록은 그 사실을 말하지
    // 않아서, 사용자는 무이자라서 0 인지 요율을 안 넣어서 0 인지 구분할 수 없었다.
    // 실제 청구서에 수수료가 붙으면 그때 처음 안다.
    //
    // 미리보기(`/billing-estimate`)는 `billingBasis` 로 이미 이 사실을 말한다. 목록만
    // 빠져 있었다 — 저장하고 나면 그 경고가 사라지는 셈이었다.
    //
    // 할부는 보통 한 자리 수라 행마다 정책을 찾아도 문제가 안 된다. 수백 건이
    // 되면 payment_method_id·months 로 묶어 한 번에 읽어야 한다(#144 유형).
    const data = db.prepare(sql).all(params).map((row) => {
      const { policy, source } = row.payment_method_id
        ? resolvePolicy(db, row.payment_method_id, row.months, row.purchase_date, row.category_id ?? null)
        : { policy: null, source: 'none' };
      return { ...row, basis: billingBasis(policy, source) };
    });

    const thisMonth = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    // FND-05(감사): 여기서 청구 기간 종료를 반영하지 않던 별도 쿼리를 쓰고 있었다.
    // 대시보드(/api/transactions/summary/dashboard)의 installmentsDue와 항상
    // 같은 값을 내도록 동일 함수를 공유한다.
    const this_month_total = installmentsDueForMonth(thisMonth);

    res.json({ data, this_month_total });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// GET /api/installments/duplicates?days=14 — 중복 의심 거래(#269 잔여)
//
// **읽기 전용이다.** B안 전환으로 "할부 구매를 이미 거래로 넣어둔" 경우가 중복이
// 되는데, 자동으로 지우지 않는다 — 이 저장소는 실거래 2,212건 유실 사고가 있었다.
// 후보를 보여주고 판단을 받는다.
//
// '/:id/...' 보다 먼저 선언한다. 뒤에 두면 'duplicates' 가 id 로 잡힐 수 있다.
router.get('/duplicates', (req, res) => {
  try {
    const days = req.query.days === undefined ? 14 : asInt(req.query.days);
    if (days === null || days < 0 || days > 365) {
      return res.status(400).json({ error: '며칠 이내를 볼지 0에서 365 사이로 정해 주세요.' });
    }
    const data = findDuplicateCandidates(db, { dayWindow: days });
    res.json({
      data,
      total_amount: data.reduce((s, c) => s + c.transaction.amount, 0),
      day_window: days,
    });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// POST /api/installments/duplicates/preview — 지울 대상 확인. DB 를 바꾸지 않는다.
router.post('/duplicates/preview', (req, res) => {
  try {
    const plan = planResolve(db, (req.body || {}).ids);
    res.json({ data: plan });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// POST /api/installments/duplicates/resolve — 사용자가 고른 것만 처리한다.
//
// 지우기는 프리뷰 지문을 요구한다(ADR 0008). 중복이 아니라고 판단한 것은
// dismiss 로 기억해 다음부터 목록에서 빠진다 — 지우는 것만이 판단이 아니다.
router.post('/duplicates/resolve', (req, res) => {
  try {
    const { delete_ids = [], keep_ids = [], preview_token } = req.body || {};

    let deleted = 0;
    if (delete_ids.length) {
      const plan = planResolve(db, delete_ids);
      if (plan.locked.length) {
        return res.status(400).json({
          error: '자동으로 만들어진 내역은 여기서 지울 수 없어요. 원래 등록한 화면에서 고쳐 주세요.',
        });
      }
      if (!preview_token) {
        return res.status(428).json({
          error: '지울 내역을 먼저 확인해 주세요. 미리보기를 거쳐야 지울 수 있어요.',
          preview_required: true,
        });
      }
      if (preview_token !== plan.fingerprint) {
        return res.status(409).json({
          error: '미리보기를 본 뒤 내용이 달라졌어요. 다시 확인하고 지워 주세요.',
          preview_stale: true,
        });
      }

      const ids = plan.rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.transaction(() => {
        deleted = db.prepare(
          `DELETE FROM transactions WHERE id IN (${placeholders}) AND COALESCE(origin,'manual')='manual'`
        ).run(...ids).changes;
      })();
    }

    const kept = keep_ids.length ? dismiss(db, keep_ids) : 0;
    res.json({ ok: true, deleted, kept });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// GET /api/installments/duplicates/dismissed — 지나친 후보 목록.
//
// 되돌리려면 무엇을 지나쳤는지 먼저 볼 수 있어야 한다. 이 목록이 없어서 restore
// 엔드포인트에 손이 닿지 않았다(#445 §2).
router.get('/duplicates/dismissed', (_req, res) => {
  try {
    res.json({ data: listDismissed(db) });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// POST /api/installments/duplicates/restore — 판단을 되돌린다(다시 목록에 나온다)
router.post('/duplicates/restore', (req, res) => {
  try {
    res.json({ ok: true, restored: undismiss(db, (req.body || {}).ids) });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// POST /api/installments/billing-estimate — 총액·개월수·정책으로 월별 청구액 계산(#316)
//
// **DB 를 바꾸지 않는다.** 입력 폼이 저장 전에 기본값을 채우려고 부르는 자리다.
// 조회지만 POST 인 이유는 본문이 여러 필드이기 때문이고, 같은 이유로 `:id` 를
// 쓰지 않는다 — 아직 저장되지 않은 값을 계산하는 것이라 대상 할부가 없다.
//
// `/:id` 패턴보다 위에 둔다. 아래에 두면 `:id` 가 'billing-estimate' 를 삼킨다.
router.post('/billing-estimate', numericBody(['total_amount', 'months', 'payment_method_id', 'category_id']), (req, res) => {
  try {
    const {
      total_amount, months, payment_method_id, purchase_date, start_billing_month, category_id,
    } = req.body || {};

    if (!total_amount || !months || !start_billing_month) {
      return res.status(400).json({ error: '총액, 개월수, 첫 청구월은 필수입니다.' });
    }
    if (months < 2) {
      return res.status(400).json({ error: 'months must be >= 2 (2개월 미만은 일시불로 처리)' });
    }

    // 정책은 구매 시점 기준으로 뽑는다. derivedTransactions 와 같은 기준이어야
    // 화면에 보여준 값과 나중에 실제로 생성되는 거래가 어긋나지 않는다.
    const asOf = purchase_date || localYMD();
    // 카테고리까지 넘긴다. 저장 시점의 resolveInstallmentPolicy 와 같은 기준이어야
    // 화면에 보여준 값과 실제로 생성되는 거래가 어긋나지 않는다(#316).
    const { policy, source } = payment_method_id
      ? resolvePolicy(db, payment_method_id, months, asOf, category_id || null)
      : { policy: null, source: 'none' };

    const estimate = estimateBilling({
      totalAmount: total_amount,
      months,
      policy,
      startBillingMonth: start_billing_month,
    });

    res.json({ data: { ...estimate, basis: billingBasis(policy, source) } });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// POST /api/installments
router.post('/', numericBody(['total_amount', 'months', 'monthly_amount', 'fee_per_month', 'payment_method_id']), (req, res) => {
  try {
    const {
      purchase_date, merchant, total_amount, months, monthly_amount,
      fee_per_month = 0, payment_method_id, start_billing_month, category_id,
    } = req.body;
    if (!purchase_date || !merchant || !total_amount || !months || !monthly_amount || !start_billing_month) {
      return res.status(400).json({ error: '구입일, 가맹점, 총액, 개월수, 월 납입액, 첫 청구월은 필수입니다.' });
    }
    if (months < 2) {
      return res.status(400).json({ error: 'months must be >= 2 (2개월 미만은 일시불로 처리)' });
    }
    // 등록과 회차 생성이 한 덩어리여야 한다. 중간에 실패하면 회차 없는 할부가
    // 남고, 사용자는 등록이 됐는지 안 됐는지 알 수 없다.
    let newId;
    let derived;
    db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month,
        payment_method_id || null, start_billing_month, category_id || null
      );
      newId = Number(result.lastInsertRowid);
      // 신규 등록은 프리뷰를 요구하지 않는다. 지울 것이 없고 만드는 것뿐이라
      // ADR 0008 이 막으려는 "조용한 대량 변경" 에 해당하지 않는다(#279 와 같은
      // 판단). 대신 몇 건이 생겼는지 응답에 실어 조용히 넘어가지 않게 한다.
      derived = applyInstallmentDerived(db, newId, { requirePreview: false });
    })();

    res.status(201).json({
      id: newId,
      ok: true,
      derived: { created: derived ? derived.create_count : 0 },
    });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// PUT /api/installments/:id
//
// 회차에 영향을 주는 값을 고치면 파생 거래를 다시 만들어야 하고, 그건 기존 행을
// 지우는 대량 변경이다. 그래서 그 경우에만 프리뷰 지문을 요구한다(ADR 0008).
// 메모처럼 회차와 무관한 수정까지 막으면 확인 단계가 습관적으로 넘겨진다.
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 할부 내역이 없습니다. 이미 삭제됐을 수 있어요.' });

    const { preview_token, ...changes } = req.body || {};

    if (changesSchedule(existing, changes)) {
      const applied = applyInstallmentDerived(db, Number(req.params.id), {
        overrides: changes,
        fingerprint: preview_token,
        requirePreview: true,
        persistInstallment: true,
      });
      return res.json({
        ok: true,
        derived: { deleted: applied.delete_count, created: applied.create_count },
      });
    }

    const merged = { ...existing, ...changes };
    db.prepare(`
      UPDATE installments SET purchase_date=?, merchant=?, total_amount=?, months=?, monthly_amount=?,
        fee_per_month=?, payment_method_id=?, start_billing_month=?, category_id=?
      WHERE id=?
    `).run(
      merged.purchase_date, merged.merchant, merged.total_amount, merged.months, merged.monthly_amount,
      merged.fee_per_month, merged.payment_method_id || null, merged.start_billing_month,
      merged.category_id || null,
      req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    if (respondDerivedError(res, e)) return;
    serverError(res, e, 'installments');
  }
});

// POST /api/installments/:id/derived/preview — 재생성 프리뷰. DB 를 바꾸지 않는다.
//
// GET 이 아니라 POST 인 이유는 "이렇게 고치면" 이라는 변경안을 본문으로 받기
// 때문이다. 조회지만 입력이 있다.
router.post('/:id/derived/preview', (req, res) => {
  try {
    const { preview_token, ...changes } = req.body || {};
    const plan = planInstallmentDerived(db, Number(req.params.id), changes);
    if (!plan) return res.status(404).json({ error: '찾는 할부 내역이 없습니다. 이미 삭제됐을 수 있어요.' });

    // target/insert_rows 는 내부 계산용이라 응답에 싣지 않는다.
    const { target, insert_rows, ...view } = plan;
    res.json({ data: view });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// POST /api/installments/:id/derived/apply — 할부 값은 그대로 두고 회차만 다시 만든다.
// 정책을 새로 입력했을 때(#271) 쓴다.
router.post('/:id/derived/apply', (req, res) => {
  try {
    const applied = applyInstallmentDerived(db, Number(req.params.id), {
      fingerprint: (req.body || {}).preview_token,
      requirePreview: true,
    });
    if (!applied) return res.status(404).json({ error: '찾는 할부 내역이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true, deleted: applied.delete_count, created: applied.create_count });
  } catch (e) {
    if (respondDerivedError(res, e)) return;
    serverError(res, e, 'installments');
  }
});

// `POST /:id/reopen` 은 없앴다(#205).
//
// 그 경로는 스윕이 있어서 존재했다. 되돌려도 다음 조회에서 스윕이 다시 완료로
// 바꾸기 때문에 #295 는 "기간이 끝났으면 되돌리기를 막는다" 는 판정을 붙여야
// 했고, 그 판정 조건(`완료 && !만료`)은 **정상 흐름에서 성립할 수 없었다** —
// '완료' 를 만드는 것이 스윕뿐이고 스윕은 만료일 때만 돌았기 때문이다.
//
// 계산으로 바꾼 지금은 개월수나 시작월을 고치면 상태가 곧바로 따라온다. 되돌리기
// 버튼이 하려던 일을 수정 화면이 그대로 한다.

// GET /api/installments/:id/derived — 이 할부가 만든 거래 목록(#270).
router.get('/:id/derived', (req, res) => {
  try {
    res.json({ data: derivedRowsFor(db, 'installments', Number(req.params.id)) });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

// DELETE /api/installments/:id
//
// 파생 거래를 같은 트랜잭션에서 지운다. 남겨두면 원본이 없는데 수정도 삭제도
// 안 되는 행이 되어 사용자가 손댈 방법이 없어진다.
router.delete('/:id', (req, res) => {
  try {
    let deleted = 0;
    db.transaction(() => {
      deleted = deleteDerivedFor(db, 'installments', Number(req.params.id));
      db.prepare('DELETE FROM installments WHERE id=?').run(req.params.id);
    })();
    res.json({ ok: true, derived: { deleted } });
  } catch (e) {
    serverError(res, e, 'installments');
  }
});

module.exports = router;
