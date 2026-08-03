'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { numericBody, asInt } = require('../src/utils/validate');

const ROOT = path.join(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'src/routes');

// 라우트 소스에서 numericBody([...]) 선언을 전부 수집한다.
function collectDeclarations() {
  const out = [];
  for (const file of fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*numericBody\(\[([^\]]*)\]\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const fields = m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
      out.push({ file, method: m[1].toUpperCase(), routePath: m[2], fields });
    }
  }
  return out;
}

const EXPECTED = [
  { file: 'accounts.js', method: 'POST', routePath: '/', fields: ['opening_balance', 'credit_limit'] },
  { file: 'accounts.js', method: 'PUT', routePath: '/:id', fields: ['opening_balance', 'credit_limit', 'is_active'] },
  { file: 'cardPolicies.js', method: 'POST', routePath: '/range', fields: ['payment_method_id', 'from_month', 'to_month', 'free_from_sequence', 'category_id'] },
  { file: 'cardProducts.js', method: 'POST', routePath: '/', fields: ['payment_method_id', 'annual_fee'] },
  { file: 'cardProducts.js', method: 'PUT', routePath: '/:id', fields: ['payment_method_id', 'annual_fee'] },
  { file: 'categories.js', method: 'POST', routePath: '/', fields: ['monthly_budget'] },
  { file: 'categories.js', method: 'PUT', routePath: '/:id', fields: ['monthly_budget', 'is_active'] },
  { file: 'debts.js', method: 'POST', routePath: '/', fields: ['balance', 'credit_limit', 'compounds', 'interest_day'] },
  { file: 'debts.js', method: 'POST', routePath: '/:id/interest', fields: ['interest_amount'] },
  { file: 'debts.js', method: 'POST', routePath: '/:id/repayments', fields: ['amount', 'principal_portion', 'interest_portion'] },
  { file: 'installments.js', method: 'POST', routePath: '/', fields: ['total_amount', 'months', 'monthly_amount', 'fee_per_month', 'payment_method_id'] },
  { file: 'paymentMethods.js', method: 'PUT', routePath: '/:id', fields: ['is_active'] },
  { file: 'recurringRules.js', method: 'PUT', routePath: '/:id', fields: ['is_active'] },
  { file: 'savings.js', method: 'POST', routePath: '/', fields: ['monthly_contribution', 'expected_payout', 'category_id'] },
];

function run(mw, body) {
  let status = null; let payload = null; let nexted = false;
  const res = { status: (c) => { status = c; return { json: (j) => { payload = j; } }; } };
  mw({ body }, res, () => { nexted = true; });
  return { status, payload, nexted };
}

describe('numericBody validation declarations', () => {
  const declarations = collectDeclarations();

  test('collected declarations match expected', () => {
    assert.strictEqual(declarations.length, EXPECTED.length);

    for (let i = 0; i < EXPECTED.length; i++) {
      const expected = EXPECTED[i];
      const actual = declarations[i];
      
      assert.strictEqual(actual.file, expected.file);
      assert.strictEqual(actual.method, expected.method);
      assert.strictEqual(actual.routePath, expected.routePath);
      assert.deepStrictEqual(actual.fields, expected.fields);
    }
  });

  test('no extra declarations', () => {
    const seen = new Set();
    for (const decl of declarations) {
      seen.add(`${decl.file}:${decl.method}:${decl.routePath}`);
    }

    for (const expected of EXPECTED) {
      assert.ok(seen.has(`${expected.file}:${expected.method}:${expected.routePath}`),
        `Unexpected declaration: ${expected.file} ${expected.method} ${expected.routePath}`);
    }
  });

  test('middleware actually validates fields', () => {
    for (const expected of EXPECTED) {
      // 미들웨어를 라우터에서 꺼내지 않는다. numericBody(fields) 로 직접 만든다.
      // 라우트가 그 필드를 실제로 선언했는지는 위의 선언 대조 테스트가 이미 본다.
      // 여기서는 동작만 검사한다 — 관심사를 나눠야 라우터 내부 구조 변경에 안 깨진다.
      const mw = numericBody(expected.fields);
      
      // Test each field
      for (const field of expected.fields) {
        // Test invalid string
        const { status, nexted, payload } = run(mw, { [field]: 'abc' });
        assert.strictEqual(status, 400);
        assert.strictEqual(nexted, false);

        // 사용자에게 내부 필드명을 노출하지 않는다(#231).
        // 뮤테이션으로 `${field} must be an integer` 를 심었을 때 통과해버려서 추가했다.
        assert.ok(!payload.error.includes(field),
          `${expected.file} ${expected.method} ${expected.routePath} / ${field}: 에러 메시지에 필드명이 노출됐다 — ${payload.error}`);

        // Test valid integer
        const { nexted: nexted1 } = run(mw, { [field]: 1000 });
        assert.strictEqual(nexted1, true);

        // Test valid integer string
        const { nexted: nexted2 } = run(mw, { [field]: '1000' });
        assert.strictEqual(nexted2, true);

        // Test missing field (should pass through)
        const { nexted: nexted3 } = run(mw, {});
        assert.strictEqual(nexted3, true);

        // Test empty string (should pass through)
        const { nexted: nexted4 } = run(mw, { [field]: '' });
        assert.strictEqual(nexted4, true);
      }
    }
  });

  test('asInt boundary values', () => {
    assert.strictEqual(asInt(1.5), null);
    assert.strictEqual(asInt('1.5'), null);
    assert.strictEqual(asInt(NaN), null);
    assert.strictEqual(asInt(Infinity), null);
    assert.strictEqual(asInt(-100), -100);
    assert.strictEqual(asInt(0), 0);
    assert.strictEqual(asInt(true), null);
    assert.strictEqual(asInt([]), null);
    assert.strictEqual(asInt({}), null);
  });
});
