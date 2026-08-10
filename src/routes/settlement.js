'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');
const { setAuditLabel } = require('../utils/auditContext');
const { planReclassify, applyReclassify } = require('../services/settlementReclassify');

// 결제 방식 일괄 재분류(#289).
//
// 021 은 기존 거래를 전부 `immediate` 로 남겼다. **자동 변환하지 않기로 한
// 결정**이다 — 이 저장소는 과거 실거래 2,212건 유실 사고가 있었고, 조용한 대량
// 변경은 같은 범주의 위험이다. 그래서 사용자가 직접 지정하는 도구를 둔다.
//
// 프리뷰 → 확인 → 실행(ADR 0008). 두 엔드포인트가 **같은 planReclassify** 를
// 부른다. 계산을 공유하고 쓰기 여부만 갈라야 프리뷰가 예고한 것과 실제로
// 바뀌는 것이 어긋나지 않는다.

const NUMERIC = ['payment_method_id'];

// POST /api/settlement/reclassify/preview — 무엇이 몇 건 바뀌고 잔액이 어떻게
// 달라지는지 계산한다. **DB 를 바꾸지 않는다.**
//
// 조건을 고칠 때마다 화면이 이 엔드포인트를 다시 부른다. 여기서 쓰기가 한 번
// 이라도 일어나면 사용자가 범위를 좁혀 보는 동안 데이터가 계속 바뀐다.
router.post('/reclassify/preview', numericBody(NUMERIC), (req, res) => {
  try {
    const plan = planReclassify(db, req.body || {});
    if (plan.error) return res.status(400).json({ error: plan.error });

    res.json({
      target: plan.target,
      count: plan.count,
      // 결제 방식이 바뀌면 청구월도 다시 정해진다(#289). `settlement` 은
      // `billing_month` 의 입력이라, 건수만 말하고 넘어가면 사용자는 결제 방식만
      // 바뀌는 줄 알고 승인한다 — ADR 0008 이 프리뷰에 요구하는 "부작용" 이다.
      billing_month_filled: plan.billing_month_filled,
      billing_month_cleared: plan.billing_month_cleared,
      samples: plan.samples,
      // 잔액이 어떻게 달라지는지(#289 의 명시 요건). 계좌별로 낸다 — 합계만
      // 주면 어느 통장 이야기인지 알 수 없어 사용자가 대조할 수 없다.
      impact: plan.impact,
      preview_token: plan.fingerprint,
      // 되돌릴 수 있는지 알린다(ADR 0008 의 프리뷰 요건). 감사 트리거가
      // UPDATE 를 행마다 잡고 한 action_id 로 묶으므로 되돌아간다.
      undoable: true,
    });
  } catch (e) {
    serverError(res, e, 'settlement');
  }
});

// POST /api/settlement/reclassify — 확인한 뒤에만 쓴다.
//
// 프리뷰 지문을 요구한다. 화면에서만 막고 엔드포인트가 열려 있으면 원칙이
// 반쪽이 된다(ADR 0008 의 "지켜지지 않을 수 있는 지점").
router.post('/reclassify', numericBody(NUMERIC), (req, res) => {
  try {
    const { preview_token } = req.body || {};
    const plan = planReclassify(db, req.body || {});
    if (plan.error) return res.status(400).json({ error: plan.error });

    if (!preview_token) {
      return res.status(428).json({
        error: '무엇이 바뀌는지 먼저 확인해 주세요. 미리보기를 거쳐야 바꿀 수 있어요.',
        preview_required: true,
      });
    }
    if (preview_token !== plan.fingerprint) {
      return res.status(409).json({
        error: '미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 바꿔 주세요.',
        preview_stale: true,
      });
    }

    // 라벨이 없으면 감사 이력에 "무엇을 했는지" 가 안 남는다. 수백 건짜리
    // 작업이 이름 없이 묶여 있으면 되돌릴지 판단할 근거가 없다(#298).
    setAuditLabel(`결제방식 재분류 → ${plan.target.payment_method_name} ${plan.target.settlement}`);
    const updated = applyReclassify(db, plan);

    // 실행 후 결과를 알린다(ADR 0008).
    //
    // impact 는 **쓰기 전에 계산한 것을 그대로 쓴다.** 다시 부르면 대상이 이미
    // 바뀌어 0건이 잡히고 impact 가 빈 배열이 된다 — 방금 무슨 일이 일어났는지
    // 를 못 보여준다. 지문으로 대상이 그대로임을 확인한 뒤라 이 값이 맞다.
    res.json({
      ok: true,
      updated,
      target: plan.target,
      impact: plan.impact,
    });
  } catch (e) {
    serverError(res, e, 'settlement');
  }
});

module.exports = router;
