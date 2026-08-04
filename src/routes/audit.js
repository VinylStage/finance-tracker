'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { findUndoable, applyUndo } = require('../services/undo');

// 감사 이력 조회와 1단계 실행취소(#300).

// 되돌릴 수 있는 작업이 있는지. 화면이 되돌리기 버튼을 낼지 정하는 데 쓴다.
//
// 되돌릴 수 없는 작업(임포트·복원·시스템)에는 버튼을 내지 않는다 — 눌렀다가
// 거부되는 것보다 처음부터 안 보이는 편이 낫다.
router.get('/undoable', (_req, res) => {
  try {
    const candidate = findUndoable(db);
    if (!candidate) return res.json({ undoable: null });

    res.json({
      undoable: {
        action_id: candidate.actionId,
        label: candidate.label,
        ts: candidate.ts,
        // 몇 건이 되돌아가는지 미리 알린다. 큰 작업은 사용자가 확인하고
        // 누를 수 있어야 한다(ADR 0008).
        affected: candidate.entries.length,
        tables: [...new Set(candidate.entries.map((e) => e.table_name))],
        // 라벨은 선택이라 대개 비어 있다(#298). 화면이 "방금 한 작업" 같은
        // 무의미한 말 대신 이름을 지어낼 수 있게 무엇을 어떻게 했는지 함께 준다.
        ops: [...new Set(candidate.entries.map((e) => e.op))],
      },
    });
  } catch (e) {
    serverError(res, e, 'audit');
  }
});

router.post('/undo', (req, res) => {
  try {
    const target = req.body?.action_id || findUndoable(db)?.actionId;
    if (!target) {
      return res.status(400).json({ error: '되돌릴 작업이 없어요.' });
    }

    const result = applyUndo(db, target);
    if (!result.ok) return res.status(409).json({ error: result.reason });

    res.json({ ok: true, reverted: result.reverted, action_id: target });
  } catch (e) {
    serverError(res, e, 'audit');
  }
});

// 감사 이력. 기본은 사용자 작업만 보여준다 — 조회 때마다 도는 시스템 스윕이
// 목록을 뒤덮기 때문이다.
router.get('/log', (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const actor = req.query.actor || 'user';

    const where = actor === 'all' ? '' : 'WHERE actor = ?';
    const params = actor === 'all' ? [] : [actor];

    const rows = db.prepare(`
      SELECT id, ts, actor, action_id, action_label, op, table_name, row_id,
             before_json, after_json, undone_at
      FROM audit_log
      ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`SELECT COUNT(*) AS cnt FROM audit_log ${where}`).get(...params).cnt;
    res.json({ data: rows, total });
  } catch (e) {
    serverError(res, e, 'audit');
  }
});

module.exports = router;
