'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');

// 결제수단을 계좌에 잇는다(#376). 018 이 payment_methods.account_id 를 만들었지만
// 그 값을 쓰는 경로가 없어, 잔액 계산의 `WHERE p.account_id = ?` 가 한 번도
// 매칭된 적이 없었다 — 모든 계좌 잔액이 opening_balance 그대로였다.
//
// FK 가 켜져 있어(init.js) 없는 계좌를 넣으면 SQLite 가 던지고 500 이 된다.
// 사용자 입력 오류이므로 400 으로 잡는다.
//
// 반환값: { ok: true, value } 또는 { ok: false, error }
function resolveAccountId(raw) {
  if (raw === undefined) return { ok: true, value: undefined }; // 안 보냄 = 유지
  // 빈 문자열은 화면의 "계좌 없음" 선택이다. null 과 같게 본다.
  if (raw === null || raw === '') return { ok: true, value: null };

  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: '연결할 계좌를 다시 골라 주세요.' };
  }
  const exists = db.prepare('SELECT 1 FROM accounts WHERE id=?').get(id);
  if (!exists) {
    return { ok: false, error: '그 계좌를 찾을 수 없어요. 목록을 새로고침한 뒤 다시 골라 주세요.' };
  }
  return { ok: true, value: id };
}

router.get('/', (req, res) => {
  const includeInactive = req.query.include_inactive;
  let query = 'SELECT * FROM payment_methods';
  const params = [];
  
  if (!includeInactive) {
    query += ' WHERE is_active=1';
  }
  
  query += ' ORDER BY name';
  
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// 등록 시점에 계좌를 고를 수 있어야 자연스럽다. 나중에 다시 들어가 잇게 하면
// 대부분 안 잇고, 그러면 잔액이 계속 안 움직인다.
router.post('/', (req, res) => {
  try {
    const { name, type } = req.body;
    const account = resolveAccountId(req.body.account_id);
    if (!account.ok) return res.status(400).json({ error: account.error });

    const result = db.prepare(
      'INSERT INTO payment_methods (name, type, account_id) VALUES (?,?,?)'
    ).run(name, type, account.value ?? null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

router.put('/:id', numericBody(['is_active']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM payment_methods WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 결제수단이 없습니다. 이미 삭제됐을 수 있어요.' });

    const account = resolveAccountId(req.body.account_id);
    if (!account.ok) return res.status(400).json({ error: account.error });

    // **안 보낸 경우와 비운 경우를 구분한다.** 이 PUT 은 전체 교체라 생략된
    // 필드를 NULL 로 덮으면, 이름만 고쳐도 계좌 연결이 조용히 끊긴다. 그러면
    // 그 결제수단의 거래가 잔액에서 통째로 빠진다.
    const accountId = account.value === undefined ? existing.account_id : account.value;

    const { name, type, is_active } = req.body;
    db.prepare('UPDATE payment_methods SET name=?, type=?, is_active=?, account_id=? WHERE id=?')
      .run(name, type, is_active ?? 1, accountId, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE payment_methods SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
