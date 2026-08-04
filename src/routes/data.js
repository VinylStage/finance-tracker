'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { runAs } = require('../utils/auditContext');
const { TRANSACTION_ORIGINS, SETTLEMENTS, DEFAULT_SETTLEMENT } = require('../constants');
const { localYMD } = require('../utils/date');
const { asInt } = require('../utils/validate');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// FND-14(감사): POST /import 핸들러 하나에 입력검증·카테고리 폴백·레거시
// 필드 판정·FK 폴백·트랜잭션 실행이 전부 들어있어 순환복잡도가 43까지
// 올라갔다. 거래 1건을 검증·정규화하는 부분만 떼어낸다 — 유효하면 삽입할
// 행 객체를, 스킵 대상이면 null을 반환한다. lookups는 카테고리/FK
// 존재확인용 조회 테이블(모든 행이 공유, 한 번만 만들면 됨)이다.
function resolveImportRow(tx, lookups) {
  // Skip if required fields are missing
  if (!tx.date || tx.amount === undefined || tx.amount === null) return null;

  // FND-06(감사): date 형식/amount 타입을 검증하지 않아 백업 파일을 통해
  // 문자열 금액이 그대로 들어올 수 있었다. 형식이 안 맞는 행은 (기존의
  // 필드 누락 행과 동일하게) 스킵하고 나머지는 정상 복원한다.
  if (!DATE_RE.test(tx.date)) return null;
  const amount = asInt(tx.amount);
  if (amount === null) return null;

  // If category_id doesn't exist, try to find by category_name (O(1) 조회)
  let categoryId = tx.category_id;
  if (!categoryId || !lookups.categoryIds.has(categoryId)) {
    const foundId = lookups.categoryByName.get(tx.category_name);
    if (foundId === undefined) return null;
    categoryId = foundId;
  }

  // Handle legacy fields — 신버전 백업은 필드가 null 이어도 존재한다.
  // 하나라도 undefined(필드 자체 부재)면 구버전 백업으로 보고 legacy 플래그를 세운다.
  const isLegacy = tx.payment_style === undefined || tx.payment_method_id === undefined ||
    tx.approval_number === undefined || tx.installment_id === undefined ||
    tx.created_at === undefined;

  let payment_method_id = tx.payment_method_id !== undefined ? tx.payment_method_id : null;
  const payment_style = tx.payment_style !== undefined ? tx.payment_style : '일시불';
  const approval_number = tx.approval_number !== undefined ? tx.approval_number : null;
  let installment_id = tx.installment_id !== undefined ? tx.installment_id : null;
  const created_at = tx.created_at !== undefined ? tx.created_at : null;

  // 현재 DB에 존재하지 않는 FK 값은 NULL로 폴백(전체 롤백 방지)
  let fkFallback = false;
  if (payment_method_id !== null && !lookups.paymentMethodIds.has(payment_method_id)) {
    payment_method_id = null;
    fkFallback = true;
  }
  if (installment_id !== null && !lookups.installmentIds.has(installment_id)) {
    installment_id = null;
    fkFallback = true;
  }

  // 거래 출처(#268). 백업에 없으면(구버전) manual 로 둔다 — 잠금이 풀리는 쪽이
  // 아니라 사용자 소유로 보는 쪽이 안전하다.
  //
  // origin_ref_id 는 참조 무결성을 검사하지 않고 그대로 복원한다. 원본 테이블
  // (installments 등)도 같은 백업에 들어 있어 함께 복원되기 때문이다. 원본이
  // 없는 경우는 파생 거래 재생성(#269)이 정리한다.
  const origin = TRANSACTION_ORIGINS.includes(tx.origin) ? tx.origin : 'manual';
  const origin_ref_table = tx.origin_ref_table !== undefined ? tx.origin_ref_table : null;
  const origin_ref_id = tx.origin_ref_id !== undefined ? tx.origin_ref_id : null;

  // 현금흐름 시점(#289). 백업에 없으면(v3 이하) immediate 로 둔다 — 구분이
  // 없던 시절의 거래가 그렇게 기록돼 있었고, 복원이 잔액을 바꾸면 안 된다.
  //
  // **여기가 잘못된 settlement 값이 들어올 수 있는 유일한 경로다.** DB CHECK 를
  // 걸지 않기로 했으므로(constants.js) origin 과 같은 방식으로 걸러낸다. 손으로
  // 고친 백업 파일이 'deferred ' 같은 값을 들고 와도 계산이 조용히 틀어지지 않는다.
  const settlement = SETTLEMENTS.includes(tx.settlement) ? tx.settlement : DEFAULT_SETTLEMENT;

  // 계좌는 참조 무결성을 검사한다. 없는 계좌를 가리키면 NULL 로 떨어뜨리고,
  // 읽는 쪽이 결제수단의 계좌로 폴백한다.
  let account_id = tx.account_id !== undefined ? tx.account_id : null;
  if (account_id !== null && !lookups.accountIds.has(account_id)) {
    account_id = null;
    fkFallback = true;
  }

  // 'YYYY-MM' 이 아니면 버린다. 청구월은 계산으로 다시 채울 수 있다(#290).
  const billing_month = /^\d{4}-\d{2}$/.test(tx.billing_month || '') ? tx.billing_month : null;

  return {
    date: tx.date, merchant: tx.merchant, amount, categoryId, memo: tx.memo,
    payment_method_id, payment_style, approval_number, installment_id, created_at,
    origin, origin_ref_table, origin_ref_id,
    settlement, account_id, billing_month,
    isLegacy, fkFallback,
  };
}

// GET /api/data/export - Export all transactions with category names
router.get('/export', (req, res) => {
  try {
    const today = localYMD().replace(/-/g, '');
    const fileName = `finance-backup-${today}.json`;
    
    // Join transactions with categories to get category names
    const txSql = `
      SELECT t.date, t.merchant, t.amount, t.category_id, c.name AS category_name, t.memo,
        t.payment_method_id, t.payment_style, t.approval_number, t.installment_id, t.created_at,
        t.origin, t.origin_ref_table, t.origin_ref_id,
        t.settlement, t.account_id, t.billing_month
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.date DESC, t.id DESC
    `;
    
    const transactions = db.prepare(txSql).all();
    
    const data = {
      exported_at: new Date().toISOString(), // 의도적 UTC 타임스탬프(내보내기 메타데이터, 로컬 날짜 아님) — 변경하지 않음
      // origin 3필드가 추가돼 3 으로 올린다(#268). 이걸 안 내보내면 복원 시
      // 파생 거래가 전부 manual 이 되어 잠금이 풀린다.
      //
      // settlement 3필드가 추가돼 4 로 올린다(#289). 안 내보내면 복원 시
      // deferred 였던 거래가 전부 immediate 로 돌아와 **잔액이 틀어진다** —
      // 통장에서 아직 안 빠진 카드값이 빠진 것으로 계산된다.
      schema_version: 4,
      transactions: transactions.map(t => ({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        category_id: t.category_id,
        category_name: t.category_name,
        memo: t.memo,
        payment_method_id: t.payment_method_id,
        payment_style: t.payment_style,
        approval_number: t.approval_number,
        installment_id: t.installment_id,
        created_at: t.created_at,
        origin: t.origin,
        origin_ref_table: t.origin_ref_table,
        origin_ref_id: t.origin_ref_id,
        settlement: t.settlement,
        account_id: t.account_id,
        billing_month: t.billing_month,
        source: 'manual'
      }))
    };
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.json(data);
  } catch (e) {
    serverError(res, e, 'data');
  }
});

// POST /api/data/import - Import transactions
// 본문 크기 제한은 server.js 전역 파서에서 관리한다(라우트별 파서는 전역보다 늦게 실행돼 무효).
router.post('/import', (req, res) => {
  try {
    const { mode, transactions, confirm } = req.body;

    // Validate input
    if (mode !== 'append' && mode !== 'overwrite') {
      return res.status(400).json({ error: '불러오기 방식을 선택해 주세요. 기존 내역에 추가하거나, 전체를 바꿀 수 있습니다.' });
    }

    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: '파일 형식이 올바르지 않습니다. 이 앱에서 내보낸 파일인지 확인해 주세요.' });
    }

    // overwrite는 기존 거래를 전부 삭제하는 파괴적 동작이므로 명시적 확인 토큰을 요구한다
    if (mode === 'overwrite' && confirm !== 'DELETE_ALL') {
      return res.status(400).json({ error: '전체 바꾸기는 추가 확인이 필요합니다. 화면의 안내를 따라 다시 시도해 주세요.' });
    }

    let imported = 0;
    let skipped = 0;
    let legacy_fields_defaulted = false;
    let fk_fallback = false;
    let deleted = 0;

    // Get all current lookups — id 존재확인/이름조회를 O(1)로.
    // 백업의 FK 값이 현재 DB에 존재하지 않을 수 있다(다른 기기 복원, 결제수단/할부 초기화 등).
    // foreign_keys=ON 이므로 없는 FK를 그대로 넣으면 트랜잭션 전체가 롤백된다. 존재하는 값만 넣고 나머지는 NULL로 폴백한다.
    const allCategories = db.prepare('SELECT id, name FROM categories').all();
    const lookups = {
      categoryIds: new Set(allCategories.map(c => c.id)),
      categoryByName: new Map(allCategories.map(c => [c.name, c.id])),
      paymentMethodIds: new Set(db.prepare('SELECT id FROM payment_methods').all().map(r => r.id)),
      installmentIds: new Set(db.prepare('SELECT id FROM installments').all().map(r => r.id)),
      accountIds: new Set(db.prepare('SELECT id FROM accounts').all().map(r => r.id)),
    };

    const restore = db.transaction(() => {
      // If overwrite mode, delete existing transactions
      if (mode === 'overwrite') {
        deleted = db.prepare('DELETE FROM transactions').run().changes;
      }

      // created_at 은 백업값을 복원하되, 없으면(구버전 백업) COALESCE 로 현재 시각을 쓴다
      const insertTx = db.prepare(`
        INSERT INTO transactions (date, merchant, amount, category_id, memo, payment_method_id, payment_style, approval_number, installment_id, created_at, origin, origin_ref_table, origin_ref_id, settlement, account_id, billing_month)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?)
      `);

      for (const tx of transactions) {
        const row = resolveImportRow(tx, lookups);
        if (!row) { skipped++; continue; }
        if (row.isLegacy) legacy_fields_defaulted = true;
        if (row.fkFallback) fk_fallback = true;
        insertTx.run(
          row.date, row.merchant, row.amount, row.categoryId, row.memo,
          row.payment_method_id, row.payment_style, row.approval_number, row.installment_id, row.created_at,
          row.origin, row.origin_ref_table, row.origin_ref_id,
          row.settlement, row.account_id, row.billing_month
        );
        imported++;
      }
    });
    
    // 백업 복원은 DB 를 통째로 갈아끼운다. 사용자가 한 건씩 넣은 것과 실행취소
    // 단위가 완전히 달라 actor 를 구분한다 — 되돌리기 대상에서 빠진다(#300).
    runAs('import', restore);
    
    const response = { ok: true, imported, skipped, deleted, total: transactions.length };
    if (legacy_fields_defaulted) {
      response.legacy_fields_defaulted = true;
    }
    if (fk_fallback) {
      response.fk_fallback = true;
    }

    res.json(response);
  } catch (e) {
    serverError(res, e, 'data');
  }
});

module.exports = router;
