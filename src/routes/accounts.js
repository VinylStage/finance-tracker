'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody, missingFields } = require('../utils/validate');
const { computeBalance, availableAmount, cardUnpaid, projectBalance } = require('../services/accountBalance');

// 계좌(통장) CRUD 와 잔액 조회(#288).
//
// 잔액은 저장하지 않고 매번 계산한다. opening_balance 이후의 거래를 합산하는데,
// 거래가 어느 계좌에 속하는지는 payment_methods.account_id 로 잇는다.

const ACCOUNT_TYPES = ['입출금', '마이너스통장', '증권', '기타'];

function validate(body) {
  const missing = missingFields(body, ['name', 'type', 'opening_date']);
  if (missing.length) return '계좌 이름, 종류, 기준일을 모두 입력해 주세요.';
  if (!ACCOUNT_TYPES.includes(body.type)) {
    return `계좌 종류는 ${ACCOUNT_TYPES.join(' / ')} 중에서 골라 주세요.`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.opening_date)) {
    return '기준일을 YYYY-MM-DD 형식으로 입력해 주세요.';
  }
  return null;
}

function normalize(body) {
  return {
    name: body.name,
    type: body.type,
    opening_balance: body.opening_balance ?? 0,
    opening_date: body.opening_date,
    // 마이너스통장이 아니면 한도가 없다. 빈 값은 전부 NULL 로 모은다 —
    // Number(null) 은 0 이 되어 "한도 0원" 이라는 다른 뜻이 된다.
    credit_limit: body.credit_limit === undefined || body.credit_limit === null || body.credit_limit === ''
      ? null : Number(body.credit_limit),
    memo: body.memo || null,
  };
}

// 그 계좌에 딸린 거래를 읽어 잔액을 계산한다.
//
// 방향(입금/출금)은 카테고리 대분류로 가른다 — '수입' 이면 들어온 돈, 나머지는
// 나간 돈이다. transactions 에 방향 컬럼이 따로 없기 때문이다.
//
// **거래에 계좌가 직접 적혀 있으면 그 값이 이긴다(#289).** 결제수단의 계좌는
// 폴백이다 — 결제수단이 나중에 다른 계좌로 옮겨져도 과거 거래는 제자리에 남는다.
//
// JOIN 이 LEFT 인 이유: 계좌만 적히고 결제수단이 없는 거래가 INNER JOIN 에서는
// 통째로 빠진다. 지금은 그런 거래가 없지만, account_id 를 쓰기 시작하면 생긴다.
function balanceOf(account) {
  const rows = db.prepare(`
    SELECT t.date, t.amount, t.settlement, t.billing_month,
           CASE WHEN c.major_type = '수입' THEN 'in' ELSE 'out' END AS direction
    FROM transactions t
    LEFT JOIN payment_methods p ON p.id = t.payment_method_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE COALESCE(t.account_id, p.account_id) = ?
  `).all(account.id);

  const result = computeBalance(account, rows);
  return {
    ...result,
    available: availableAmount(account, result.balance),
    // 카드 미결제액은 잔액과 **별개 축**이다. 통장에 있는 돈과 나갈 예정인 돈을
    // 한 숫자로 합치면 사용자가 어느 쪽을 보는지 알 수 없다(#291).
    card_unpaid: cardUnpaid(rows),
    // 예정된 인출만 반영한 앞으로의 잔액(#291). 앞으로의 지출은 알 수 없으므로
    // 반영 범위를 projection.includes 로 같이 내려보낸다 — 화면이 그걸
    // 사용자에게 말해야 한다. 예측을 단정적으로 제시하면 그대로 믿고 손해를 본다.
    projection: projectBalance(account, rows),
  };
}

router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.include_inactive;
    const rows = db.prepare(
      `SELECT * FROM accounts ${includeInactive ? '' : 'WHERE is_active=1'} ORDER BY name`
    ).all();
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'accounts');
  }
});

// 잔액은 별도 경로로 뺀다. 목록 조회마다 전 계좌를 합산하면 화면이 느려진다.
// '/:id' 보다 먼저 선언해야 한다 — 뒤에 두면 'balances' 가 id 로 잡힌다.
router.get('/balances', (_req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts WHERE is_active=1 ORDER BY name').all();
    res.json({ data: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, ...balanceOf(a) })) });
  } catch (e) {
    serverError(res, e, 'accounts');
  }
});

router.get('/:id', (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id);
    if (!account) return res.status(404).json({ error: '찾는 계좌가 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ...account, ...balanceOf(account) });
  } catch (e) {
    serverError(res, e, 'accounts');
  }
});

router.post('/', numericBody(['opening_balance', 'credit_limit']), (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const a = normalize(req.body);
    const info = db.prepare(`
      INSERT INTO accounts (name, type, opening_balance, opening_date, credit_limit, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(a.name, a.type, a.opening_balance, a.opening_date, a.credit_limit, a.memo);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '같은 이름의 계좌가 이미 있어요.' });
    }
    serverError(res, e, 'accounts');
  }
});

router.put('/:id', numericBody(['opening_balance', 'credit_limit', 'is_active']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 계좌가 없습니다. 이미 삭제됐을 수 있어요.' });

    const merged = { ...existing, ...req.body };
    const err = validate(merged);
    if (err) return res.status(400).json({ error: err });

    const a = normalize(merged);
    db.prepare(`
      UPDATE accounts SET name=?, type=?, opening_balance=?, opening_date=?,
             credit_limit=?, memo=?, is_active=?
      WHERE id=?
    `).run(a.name, a.type, a.opening_balance, a.opening_date, a.credit_limit, a.memo,
           merged.is_active ?? 1, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '같은 이름의 계좌가 이미 있어요.' });
    }
    serverError(res, e, 'accounts');
  }
});

// 계좌를 지워도 거래와 결제수단은 남는다. 연결만 끊어져 "계좌 미지정" 이 된다 —
// 거래를 지우면 가계부 기록이 사라진다.
router.delete('/:id', (req, res) => {
  try {
    const linked = db.prepare('SELECT COUNT(*) AS cnt FROM payment_methods WHERE account_id=?')
      .get(req.params.id).cnt;

    db.transaction(() => {
      db.prepare('UPDATE payment_methods SET account_id=NULL WHERE account_id=?').run(req.params.id);
      db.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id);
    })();

    res.json({ ok: true, unlinked: linked });
  } catch (e) {
    serverError(res, e, 'accounts');
  }
});

module.exports = router;
