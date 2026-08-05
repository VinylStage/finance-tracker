'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');
const { planBackfill, applyBackfill, countMissing } = require('../services/billingMonthBackfill');
const { setAuditLabel } = require('../utils/auditContext');

// 청구월 소급(#289). 카드 주기를 나중에 넣거나 고쳤을 때 기존 거래의 청구월을
// 다시 맞춘다.
//
// 계산은 `services/billingMonthBackfill` 한 곳에만 있고 이 파일은 **쓰기 여부만
// 가른다.** 프리뷰 로직과 실행 로직이 갈라지면 사용자가 본 것과 저장되는 것이
// 어긋난다(ADR 0008 이 비용으로 명시한 지점).

// 아직 청구월이 비어 있는 deferred 거래 수. 화면이 소급이 필요한 상태인지
// 열기 전에 알 수 있어야 한다.
router.get('/missing-count', (_req, res) => {
  try {
    res.json({ missing: countMissing(db) });
  } catch (e) {
    serverError(res, e, 'billingMonth');
  }
});

// POST /api/billing-month/backfill/preview
//
// **DB 를 바꾸지 않는다**(ADR 0008). 모드를 바꿔 가며 여러 번 부를 수 있어야
// 하므로, 여기서 쓰기가 한 번이라도 일어나면 사용자가 비교해 보는 동안 데이터가
// 계속 바뀐다.
router.post('/backfill/preview', numericBody(['card_product_id']), (req, res) => {
  try {
    const plan = planBackfill(db, req.body || {});
    if (plan.error) return res.status(400).json({ error: plan.error });

    res.json({
      mode: plan.mode,
      card: plan.card,
      scanned: plan.scanned,
      count: plan.count,
      filled: plan.filled,
      cleared: plan.cleared,
      rewritten: plan.rewritten,
      skipped_written: plan.skipped_written,
      samples: plan.samples,
      preview_token: plan.fingerprint,
      // 실행취소로 되돌릴 수 있는지 알린다(ADR 0008 의 프리뷰 요건). 감사
      // 트리거가 UPDATE 를 행마다 잡고 한 action_id 로 묶으므로 되돌아간다.
      undoable: true,
    });
  } catch (e) {
    serverError(res, e, 'billingMonth');
  }
});

// POST /api/billing-month/backfill — 확인한 뒤에만 쓴다.
//
// 프리뷰 지문을 요구한다. 화면에서만 막고 엔드포인트가 열려 있으면 원칙이
// 반쪽이 된다(ADR 0008 의 "지켜지지 않을 수 있는 지점").
router.post('/backfill', numericBody(['card_product_id']), (req, res) => {
  try {
    const { preview_token } = req.body || {};
    const plan = planBackfill(db, req.body || {});
    if (plan.error) return res.status(400).json({ error: plan.error });

    if (!preview_token) {
      return res.status(428).json({
        error: '무엇이 바뀌는지 먼저 확인해 주세요. 미리보기를 거쳐야 채울 수 있어요.',
        preview_required: true,
      });
    }
    if (preview_token !== plan.fingerprint) {
      return res.status(409).json({
        error: '미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 채워 주세요.',
        preview_stale: true,
      });
    }

    // 라벨이 없으면 감사 이력에 "무엇을 했는지" 가 안 남는다. 되돌릴지 판단할
    // 근거가 사라진다(#298).
    setAuditLabel(`청구월 소급${plan.card ? ` → ${plan.card.product_name}` : ''}`);
    const updated = applyBackfill(db, plan);

    res.json({
      ok: true,
      updated,
      missing: countMissing(db),
      mode: plan.mode,
      card: plan.card,
    });
  } catch (e) {
    serverError(res, e, 'billingMonth');
  }
});

module.exports = router;
