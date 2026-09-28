'use strict';

const express = require('express');

const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { setAuditLabel } = require('../utils/auditContext');
const { planOverseasBackfill, applyOverseasBackfill } = require('../services/cardOverseas');

// 이미 들어와 있는 결제에 해외 표시를 채운다(#710 · ADR 0010).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 마이그레이션이 안 했나
//
// 034 는 칸만 만들고 전부 `0` 으로 뒀다. **추론으로 얻은 값을 사람 확인 없이
// 실거래에 박지 않는다** — 되돌리기가 사람 몫이 된다.
//
// 임포터는 이제 새로 들어오는 결제에 표시를 단다. 그런데 **이미 들어와 있는 것**은
// 그때 표시가 없었으므로 여기서 채운다. 실측(2026-09-17)으로 18건 있었다.
//
// ─────────────────────────────────────────────────────────────────────────
// 프리뷰 → 확인 → 실행 (ADR 0008)
//
// `cardRemap` 과 같은 모양이다. 계산은 `services/cardOverseas.js` 한 곳에만 있고
// **라우트는 쓰기 여부만 가른다** — 프리뷰 로직과 실행 로직이 갈라지면 사용자가
// 본 것과 저장되는 것이 어긋난다.

// GET /api/card-overseas/backfill/preview — 무엇이 몇 건 바뀌는지 계산한다.
//
// **DB 를 바꾸지 않는다**(ADR 0008). 그래서 GET 이다.
//
// `cardRemap` 의 프리뷰는 POST 인데, 그쪽은 기간·가맹점·금액 같은 조건을 본문으로
// 받기 때문이다. 이 백필은 **받을 조건이 없다** — 「표시가 있는데 안 선 것」 이
// 대상 전부다. 조건이 없는데 POST 로 두면 읽기인지 쓰기인지가 주소만 봐서는
// 안 보인다.
router.get('/backfill/preview', (_req, res) => {
  try {
    const plan = planOverseasBackfill(db);
    res.json({
      count: plan.count,
      amount: plan.amount,
      // 근거별 건수. 「원 통화가 찍힌 건」 과 「말미에 국가코드가 붙은 건」 은
      // 사용자가 다르게 봐야 한다 — 후자가 오탐 여지가 크다.
      byEvidence: plan.byEvidence,
      samples: plan.samples,
      preview_token: plan.fingerprint,
      // 되돌릴 수 있는지 알린다(ADR 0008 의 프리뷰 요건). 감사 트리거가
      // UPDATE 를 행마다 잡고 한 action_id 로 묶으므로 되돌아간다.
      undoable: true,
    });
  } catch (e) {
    serverError(res, e, 'cardOverseas');
  }
});

// POST /api/card-overseas/backfill — 확인한 뒤에만 쓴다.
router.post('/backfill', (req, res) => {
  try {
    const { preview_token } = req.body || {};
    const plan = planOverseasBackfill(db);

    // 화면에서만 막고 엔드포인트가 열려 있으면 원칙이 반쪽이 된다
    // (ADR 0008 의 "지켜지지 않을 수 있는 지점").
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

    // 라벨이 없으면 감사 이력에 «무엇을 했는지» 가 안 남는다. 되돌릴지 판단할
    // 근거가 사라진다(#298).
    setAuditLabel(`해외결제 표시 채우기 ${plan.count}건`);
    const updated = applyOverseasBackfill(db, plan);

    // 실행 후 결과를 다시 알린다(ADR 0008). 남은 건수가 0 이어야 끝난 것이다.
    const after = planOverseasBackfill(db);
    return res.json({ ok: true, updated, remaining: after.count });
  } catch (e) {
    return serverError(res, e, 'cardOverseas');
  }
});

module.exports = router;
