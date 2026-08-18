'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { PAYMENT_STYLES, MAJOR_TYPES } = require('../constants');

// GET /api/data-integrity
router.get('/', (req, res) => {
  try {
    const checks = [];

    // 1. 비ISO 날짜 형식
    //
    // `date(x) IS NOT x` 는 «SQLite 가 날짜로 못 읽거나, 읽었더니 원래 글자와
    // 다른» 값을 잡는다. 글자꼴만 보던 예전 검사는 `abcd-ef-gh` 를 통과시켰고
    // (길이 10, 5·8번째가 하이픈), `2026-13-45`·`2026-02-30` 도 통과시켰다.
    const invalidDates = db.prepare(`
      SELECT id, date FROM transactions
      WHERE date IS NULL OR date(date) IS NOT date
      LIMIT 20
    `).all();
    checks.push({
      name: '비ISO 날짜 형식',
      count: db.prepare(`SELECT count(*) as count FROM transactions WHERE date IS NULL OR date(date) IS NOT date`).get().count,
      samples: invalidDates
    });

    // 2. payment_style/major_type 이상값
    const invalidPaymentStyles = db.prepare(`
      SELECT t.id, t.payment_style FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.payment_style NOT IN (${PAYMENT_STYLES.map(() => '?').join(',')})
      LIMIT 20
    `).all(...PAYMENT_STYLES);
    checks.push({
      name: 'payment_style 이상값',
      count: db.prepare(`SELECT count(*) as count FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.payment_style NOT IN (${PAYMENT_STYLES.map(() => '?').join(',')})`).get(...PAYMENT_STYLES).count,
      samples: invalidPaymentStyles
    });

    const invalidMajorTypes = db.prepare(`
      SELECT c.id, c.major_type FROM categories c
      WHERE c.major_type NOT IN (${MAJOR_TYPES.map(() => '?').join(',')})
      LIMIT 20
    `).all(...MAJOR_TYPES);
    checks.push({
      name: 'major_type 이상값',
      count: db.prepare(`SELECT count(*) as count FROM categories c WHERE c.major_type NOT IN (${MAJOR_TYPES.map(() => '?').join(',')})`).get(...MAJOR_TYPES).count,
      samples: invalidMajorTypes
    });

    // 3. 금액이 비정상적으로 작은 임포트 건
    const smallAmounts = db.prepare(`
      SELECT id, amount FROM transactions
      WHERE amount > 0 AND amount < 100
      LIMIT 20
    `).all();
    checks.push({
      name: '금액이 비정상적으로 작은 임포트 건',
      count: db.prepare(`SELECT count(*) as count FROM transactions WHERE amount > 0 AND amount < 100`).get().count,
      samples: smallAmounts
    });

    // 4번 점검("종료됐어야 하는데 진행중으로 남은 할부")은 없앴다(#205).
    //
    // 그 점검은 `status` 컬럼이 계산 결과를 늦게 받아 적는 캐시였기 때문에
    // 필요했다. 캐시를 갱신하는 것이 GET 요청 안의 스윕뿐이라, 조회가 한 번도
    // 안 일어난 사이에는 저장된 값이 사실과 달랐다.
    //
    // 이제 상태를 조회할 때마다 계산한다. 어긋날 저장값이 없으므로 이 점검은
    // 구조적으로 0 만 낼 수 있다 — 항상 0 인 항목을 목록에 두면 나머지 점검의
    // 신뢰도까지 깎는다.

    // 5. 카테고리 없는 거래(orphan category_id) 및 중복 승인번호
    const orphanTransactions = db.prepare(`
      SELECT id, category_id FROM transactions t
      WHERE t.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id)
      LIMIT 20
    `).all();
    checks.push({
      name: '카테고리 없는 거래',
      count: db.prepare(`
        SELECT count(*) as count FROM transactions t
        WHERE t.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id)
      `).get().count,
      samples: orphanTransactions
    });

    const duplicateApprovalNumbers = db.prepare(`
      SELECT approval_number, count(*) as cnt FROM transactions
      WHERE approval_number IS NOT NULL
      GROUP BY approval_number
      HAVING count(*) > 1
      LIMIT 20
    `).all();
    checks.push({
      name: '중복 승인번호',
      count: db.prepare(`
        SELECT count(*) as count FROM (
          SELECT approval_number FROM transactions
          WHERE approval_number IS NOT NULL
          GROUP BY approval_number
          HAVING count(*) > 1
        )
      `).get().count,
      samples: duplicateApprovalNumbers.map(row => ({ approval_number: row.approval_number, count: row.cnt }))
    });

    // 6. 다른 표의 날짜꼴 이상
    //
    // transactions.date 만 보던 검사를 넓힌다. 저축·할부·반복규칙의 날짜가 깨지면
    // 만기 처리·회차 생성이 NaN 을 낳고, 그 결과가 다시 거래로 들어간다(#666).
    // 날짜 컬럼은 `date(x) IS NOT x` 하나로 본다 — 글자꼴이 틀린 것과 «없는 날짜»
    // 를 한꺼번에 잡는다. start_billing_month 만 YYYY-MM 이라 하루를 붙여 본다.
    const DAY = (t, c, label) => `
      SELECT '${label}' AS table_name, '${c}' AS column_name, id AS row_id, ${c} AS value
        FROM ${t} WHERE ${c} IS NOT NULL AND date(${c}) IS NOT ${c}`;
    const DATE_COLUMNS = [
      DAY('savings_products', 'start_date', '저축'),
      DAY('savings_products', 'maturity_date', '저축'),
      DAY('installments', 'purchase_date', '할부'),
      `
      SELECT '할부' AS table_name, 'start_billing_month' AS column_name, id AS row_id,
             start_billing_month AS value
        FROM installments
       WHERE start_billing_month IS NOT NULL
         AND (start_billing_month NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
              OR date(start_billing_month || '-01') IS NOT (start_billing_month || '-01'))`,
      DAY('recurring_rules', 'starts_on', '반복규칙'),
      DAY('recurring_rules', 'ends_on', '반복규칙'),
      DAY('debt_repayments', 'repaid_on', '부채 상환'),
      DAY('debt_interest_log', 'log_date', '부채 이자'),
    ].join('\n      UNION ALL\n');
    checks.push({
      name: '다른 표의 날짜꼴 이상',
      count: db.prepare(`SELECT count(*) AS count FROM (${DATE_COLUMNS})`).get().count,
      samples: db.prepare(`${DATE_COLUMNS} LIMIT 20`).all(),
    });

    res.json({ checks });
  } catch (e) {
    serverError(res, e, 'data-integrity');
  }
});

module.exports = router;
