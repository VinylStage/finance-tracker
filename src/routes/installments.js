'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYearMonth, localYMD } = require('../utils/date');
const { installmentsDueForMonth } = require('../utils/aggregation');
const { numericBody } = require('../utils/validate');
const { INSTALLMENT_SCHEDULE_FIELDS } = require('../constants');
const {
  planInstallmentDerived, applyInstallmentDerived, derivedRowsFor, deleteDerivedFor,
  PreviewRequiredError, PreviewMismatchError,
} = require('../services/derivedTransactions');

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
const MONTHS_ELAPSED = `
  (? - CAST(strftime('%Y', i.start_billing_month || '-01') AS INT)) * 12
  + ? - CAST(strftime('%m', i.start_billing_month || '-01') AS INT)
  + 1
`;

// #121(감사 파생): status='진행중'을 사람이 수동으로 '완료'로 바꿔야 했다.
// 이 앱엔 배치/스케줄러가 없으므로, remaining_months를 매 조회마다 동적으로
// 계산하는 이 라우트의 기존 방식과 일관되게 조회 시점에 자가교정한다 —
// 청구 기간이 끝난 '진행중' 행을 GET 때마다 '완료'로 갱신.
function completeExpiredInstallments() {
  const today = localYMD();
  db.prepare(`
    UPDATE installments
    SET status = '완료'
    WHERE status = '진행중'
      AND ? >= strftime('%Y-%m-%d', date(start_billing_month || '-01', '+' || months || ' months'))
  `).run(today);
}

// GET /api/installments?status=진행중
router.get('/', (req, res) => {
  try {
    completeExpiredInstallments();
    const { status } = req.query;
    const [curYear, curMonth] = localYearMonth();
    let sql = `
      SELECT i.*,
        p.name AS payment_method_name,
        MAX(0, i.months - (${MONTHS_ELAPSED})) AS remaining_months,
        MIN(i.months, MAX(0, ${MONTHS_ELAPSED})) AS billed_months
      FROM installments i
      LEFT JOIN payment_methods p ON i.payment_method_id = p.id
      WHERE 1=1
    `;
    const params = [curYear, curMonth, curYear, curMonth];
    if (status) { sql += ' AND i.status = ?'; params.push(status); }
    sql += ' ORDER BY i.status ASC, i.start_billing_month DESC';
    const data = db.prepare(sql).all(...params);

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

// POST /api/installments
router.post('/', numericBody(['total_amount', 'months', 'monthly_amount', 'fee_per_month', 'payment_method_id']), (req, res) => {
  try {
    const {
      purchase_date, merchant, total_amount, months, monthly_amount,
      fee_per_month = 0, payment_method_id, start_billing_month,
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
        INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '진행중')
      `).run(purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id || null, start_billing_month);
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
// 메모·상태처럼 회차와 무관한 수정까지 막으면 확인 단계가 습관적으로 넘겨진다.
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
        fee_per_month=?, payment_method_id=?, start_billing_month=?, status=?
      WHERE id=?
    `).run(
      merged.purchase_date, merged.merchant, merged.total_amount, merged.months, merged.monthly_amount,
      merged.fee_per_month, merged.payment_method_id || null, merged.start_billing_month, merged.status,
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
