'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 실사용 DB 를 건드리지 않는다. init.js 를 require 하기 전에 DB_PATH 를 임시 경로로
// 바꿔 격리한다 — 스키마·마이그레이션을 그대로 태워야 011 이 실제로 도는지도 확인된다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-loan-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const db = require('../src/db/init');
const {
  strategyFor, settingsFor, validateLoanFields, creditLineStatus,
  UnknownLoanTypeError, StrategyNotReadyError,
} = require('../src/services/interest');
const {
  rateAt, rateTimeline, setDebtRate, listRates, validateRateChange,
} = require('../src/services/debtRate');
const { LOAN_TYPES, LOAN_TYPE_DEFAULTS } = require('../src/constants');
const generalLoan = require('../src/services/interest/generalLoan');

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeDebt(over = {}) {
  const v = {
    name: '테스트부채', balance: 1000000, annual_rate: 5, type: '일반',
    loan_type: 'general', credit_limit: null, interest_basis: null,
    compounds: null, interest_day: null, ...over,
  };
  const info = db.prepare(`
    INSERT INTO debts (name, balance, annual_rate, type, memo,
                       loan_type, credit_limit, interest_basis, compounds, interest_day)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `).run(v.name, v.balance, v.annual_rate, v.type, v.loan_type,
         v.credit_limit, v.interest_basis, v.compounds, v.interest_day);
  return Number(info.lastInsertRowid);
}

beforeEach(() => {
  db.prepare('DELETE FROM debt_rate_history').run();
  db.prepare('DELETE FROM debt_interest_log').run();
  db.prepare('DELETE FROM debts').run();
});

describe('A. 마이그레이션 011', () => {
  test('A-1. debts 에 유형 컬럼이 생긴다', () => {
    const cols = db.prepare('PRAGMA table_info(debts)').all().map((c) => c.name);
    for (const c of ['loan_type', 'credit_limit', 'interest_basis', 'compounds', 'interest_day']) {
      assert.ok(cols.includes(c), `${c} 없음`);
    }
  });

  test('A-2. debt_rate_history 테이블과 인덱스가 생긴다', () => {
    const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='debt_rate_history'").get();
    assert.ok(t, '테이블 없음');
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_debt_rate_debt'").get();
    assert.ok(idx, '인덱스 없음');
  });

  test('A-3. type 과 loan_type 은 다른 축이다', () => {
    // 용도(학자금)를 바꿔도 계산 방식은 general 그대로여야 한다. 한 컬럼으로
    // 합쳐 있었다면 용도를 고치는 순간 계산이 바뀐다.
    const id = makeDebt({ type: '학자금' });
    const row = db.prepare('SELECT type, loan_type FROM debts WHERE id=?').get(id);
    assert.strictEqual(row.type, '학자금');
    assert.strictEqual(row.loan_type, 'general');
  });

  test('A-4. 기존 행은 general 로 남아 동작이 바뀌지 않는다', () => {
    const id = makeDebt({ balance: 1200000, annual_rate: 12 });
    const row = db.prepare(`
      SELECT *, ROUND(balance * annual_rate / 100.0 / 12) AS monthly_interest
      FROM debts WHERE id=?
    `).get(id);
    assert.strictEqual(row.loan_type, 'general');
    // 컬럼은 비어 있고 유형 기본값이 단리를 준다 — "안 고름" 과 "복리 아님" 을
    // 컬럼에서 같은 값으로 두면 기본값을 적용할 자리가 사라진다.
    assert.strictEqual(row.compounds, null);
    assert.strictEqual(settingsFor(row).compounds, 0);
    // M10 이전과 같은 값 — 1,200,000 × 12% ÷ 12 = 12,000
    assert.strictEqual(row.monthly_interest, 12000);
  });
});

describe('B. 마이그레이션 011 — 마이너스통장 이관과 금리 시드', () => {
  // 마이그레이션은 이미 돌았으므로 up() 을 직접 불러 격리 DB 에서 재현한다.
  const migration = require('../migrations/011-add-loan-type-and-rate-history');

  test('B-1. type=마이너스통장 이 credit_line 으로 옮겨진다', () => {
    // 마이그레이션 이전 상태를 흉내낸다 — 유형 컬럼을 기본값으로 되돌린다.
    const id = makeDebt({ type: '마이너스통장', balance: 3566196, annual_rate: 4.17 });
    db.prepare("UPDATE debts SET loan_type='general', interest_basis=NULL, compounds=0 WHERE id=?").run(id);
    db.prepare('DELETE FROM debt_rate_history WHERE debt_id=?').run(id);

    migration.up(db);

    const row = db.prepare('SELECT loan_type, interest_basis, compounds FROM debts WHERE id=?').get(id);
    assert.strictEqual(row.loan_type, 'credit_line');
    assert.strictEqual(row.interest_basis, 'daily');
    assert.strictEqual(row.compounds, 1);
  });

  test('B-2. 금리 이력이 비어 있으면 현재 금리를 첫 행으로 심는다', () => {
    const id = makeDebt({ annual_rate: 4.17 });
    db.prepare('DELETE FROM debt_rate_history WHERE debt_id=?').run(id);

    migration.up(db);

    const rows = listRates(db, id);
    assert.strictEqual(rows.length, 1, '이력이 비면 과거 구간 계산이 통째로 막힌다');
    assert.strictEqual(rows[0].annual_rate, 4.17);
    assert.ok(rows[0].effective_from);
  });

  test('B-3. 두 번 실행해도 이력이 늘지 않는다', () => {
    const id = makeDebt({ annual_rate: 4.17 });
    db.prepare('DELETE FROM debt_rate_history WHERE debt_id=?').run(id);
    migration.up(db);
    migration.up(db);
    assert.strictEqual(listRates(db, id).length, 1);
  });

  test('B-4. 이미 이력이 있으면 덮어쓰지 않는다', () => {
    const id = makeDebt({ annual_rate: 4.55 });
    db.prepare('DELETE FROM debt_rate_history WHERE debt_id=?').run(id);
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    migration.up(db);
    const rows = listRates(db, id);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].annual_rate, 4.17, '사용자가 넣은 이력을 마이그레이션이 덮었다');
  });
});

describe('C. 유형 정본과 전략 디스패치', () => {
  // (유형, 기대 설정) 표. 새 유형을 LOAN_TYPES 에 넣고 여기 안 적으면 C-1 이 깨진다.
  const TABLE = [
    { loan_type: 'general', interest_basis: 'monthly', compounds: 0, requires: [] },
    { loan_type: 'credit_line', interest_basis: 'daily', compounds: 1, requires: ['credit_limit'] },
  ];

  test('C-1. 정본의 모든 유형이 표에 있다', () => {
    assert.deepStrictEqual(
      TABLE.map((r) => r.loan_type).sort(), [...LOAN_TYPES].sort(),
      '새 유형을 추가했으면 이 표와 기대 산출도 함께 채워야 한다'
    );
  });

  for (const row of TABLE) {
    test(`C. ${row.loan_type} 기본값`, () => {
      const d = LOAN_TYPE_DEFAULTS[row.loan_type];
      assert.strictEqual(d.interest_basis, row.interest_basis);
      assert.strictEqual(d.compounds, row.compounds);
      assert.deepStrictEqual(d.requires, row.requires);
    });
  }

  test('C-2. 모르는 유형은 조용히 기본값으로 흐르지 않고 실패한다', () => {
    assert.throws(() => strategyFor('알수없음'), UnknownLoanTypeError);
    assert.throws(() => settingsFor({ loan_type: '알수없음' }), UnknownLoanTypeError);
  });

  test('C-3. 전략이 아직 없는 유형은 그 사실을 명시적으로 알린다', () => {
    // 틀린 계산보다 계산이 없는 편이 낫다.
    assert.throws(() => strategyFor('credit_line'), StrategyNotReadyError);
  });

  test('C-4. general 은 전략이 있다', () => {
    assert.strictEqual(strategyFor('general'), generalLoan);
  });
});

describe('D. settingsFor — 유형만 고르면 계산이 정해진다', () => {
  test('D-1. 비어 있으면 유형 기본값으로 채운다', () => {
    const s = settingsFor({ loan_type: 'credit_line', interest_basis: null, compounds: null });
    assert.strictEqual(s.interest_basis, 'daily');
    assert.strictEqual(s.compounds, 1);
  });

  test('D-2. 행에 값이 있으면 그것이 이긴다', () => {
    const s = settingsFor({ loan_type: 'credit_line', interest_basis: 'monthly', compounds: 0 });
    assert.strictEqual(s.interest_basis, 'monthly');
    assert.strictEqual(s.compounds, 0, '0 을 값 없음으로 보면 꺼둔 복리가 되살아난다');
  });

  test('D-3. loan_type 이 없으면 general 로 본다', () => {
    assert.strictEqual(settingsFor({}).loan_type, 'general');
  });
});

describe('E. 유형별 필수 필드', () => {
  test('E-1. 마이너스통장인데 한도가 없으면 거부', () => {
    const msg = validateLoanFields({ loan_type: 'credit_line' });
    assert.ok(msg);
    assert.ok(msg.includes('한도'));
  });

  test('E-2. 한도가 0 이하면 거부', () => {
    assert.ok(validateLoanFields({ loan_type: 'credit_line', credit_limit: 0 }));
    assert.ok(validateLoanFields({ loan_type: 'credit_line', credit_limit: -1 }));
  });

  test('E-3. 한도가 있으면 통과', () => {
    assert.strictEqual(validateLoanFields({ loan_type: 'credit_line', credit_limit: 4800000 }), null);
  });

  test('E-4. general 은 한도를 요구하지 않는다', () => {
    assert.strictEqual(validateLoanFields({ loan_type: 'general' }), null);
  });

  test('E-5. 거부 문구에 내부 필드명이 없다', () => {
    for (const bad of ['credit_limit', 'loan_type', 'interest_basis']) {
      assert.ok(!validateLoanFields({ loan_type: 'credit_line' }).includes(bad));
    }
  });
});

describe('F. 한도 초과', () => {
  test('F-1. 여유 한도를 계산한다 — 실제 계좌 조건', () => {
    const s = creditLineStatus({ credit_limit: 4800000, balance: 3566196 });
    assert.strictEqual(s.available, 1233804);
    assert.strictEqual(s.over_limit, false);
  });

  test('F-2. 초과를 알리되 막지는 않는다', () => {
    // 연체 이자가 붙어 한도를 넘는 상태가 실제로 있다. 입력을 거부하면 사용자가
    // 사실을 기록할 방법이 없어진다.
    const s = creditLineStatus({ credit_limit: 4800000, balance: 4900000 });
    assert.strictEqual(s.over_limit, true);
    assert.strictEqual(s.available, -100000);
  });

  test('F-3. 한도가 없는 유형은 null', () => {
    assert.strictEqual(creditLineStatus({ credit_limit: null, balance: 100 }), null);
  });
});

describe('G. 금리 이력 — 시점별 조회', () => {
  test('G-1. 그 날짜에 적용되던 금리를 돌려준다', () => {
    const id = makeDebt({ annual_rate: 4.17 });
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    setDebtRate(db, id, { annual_rate: 4.55, effective_from: '2026-04-01' });

    assert.strictEqual(rateAt(db, id, '2026-03-31'), 4.17);
    assert.strictEqual(rateAt(db, id, '2026-04-01'), 4.55);
    assert.strictEqual(rateAt(db, id, '2026-06-15'), 4.55);
  });

  test('G-2. 이력보다 앞선 날짜는 null — 0 으로 흘리지 않는다', () => {
    // 모르는 구간을 0% 로 계산하면 이자가 조용히 사라진다.
    const id = makeDebt();
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    assert.strictEqual(rateAt(db, id, '2025-12-31'), null);
  });

  test('G-3. 새 구간을 열면 이전 구간이 전날로 닫힌다', () => {
    const id = makeDebt();
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    const r = setDebtRate(db, id, { annual_rate: 4.55, effective_from: '2026-04-01' });
    assert.strictEqual(r.closed, 1);

    const rows = listRates(db, id);
    const older = rows.find((x) => x.annual_rate === 4.17);
    assert.strictEqual(older.effective_to, '2026-03-31', '구간이 겹치면 어느 금리를 쓸지 알 수 없다');
  });

  test('G-4. 같은 시작일로 다시 넣으면 그 행을 고친다', () => {
    const id = makeDebt();
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    setDebtRate(db, id, { annual_rate: 4.20, effective_from: '2026-01-01' });
    const rows = listRates(db, id);
    assert.strictEqual(rows.length, 1, '오타를 고칠 때마다 이력이 늘면 읽을 수 없다');
    assert.strictEqual(rows[0].annual_rate, 4.20);
  });

  test('G-5. debts.annual_rate 가 현재 이력과 어긋나지 않는다', () => {
    // 같은 뜻의 값이 두 곳에 있으면서 각자 갱신되면 #267 free_months 와 같은 결함이 난다.
    const id = makeDebt({ annual_rate: 4.17 });
    setDebtRate(db, id, { annual_rate: 4.55, effective_from: '2020-01-01' });
    const row = db.prepare('SELECT annual_rate FROM debts WHERE id=?').get(id);
    assert.strictEqual(row.annual_rate, 4.55);
    assert.strictEqual(row.annual_rate, rateAt(db, id, new Date().toISOString().slice(0, 10)));
  });

  test('G-6. 미래 시작일 이력은 현재 금리를 바꾸지 않는다', () => {
    const id = makeDebt({ annual_rate: 4.17 });
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2020-01-01' });
    setDebtRate(db, id, { annual_rate: 9.99, effective_from: '2099-01-01' });
    const row = db.prepare('SELECT annual_rate FROM debts WHERE id=?').get(id);
    assert.strictEqual(row.annual_rate, 4.17, '아직 오지 않은 금리가 현재값을 덮었다');
  });
});

describe('H. 금리 구간 타임라인 (#286 입력)', () => {
  test('H-1. 기간을 금리 변경점에서 자른다', () => {
    const id = makeDebt();
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    setDebtRate(db, id, { annual_rate: 4.55, effective_from: '2026-04-01' });

    const segs = rateTimeline(db, id, '2026-03-01', '2026-05-01');
    assert.deepStrictEqual(segs, [
      { from: '2026-03-01', to: '2026-04-01', annual_rate: 4.17 },
      { from: '2026-04-01', to: '2026-05-01', annual_rate: 4.55 },
    ]);
  });

  test('H-2. 구간이 반개구간이라 하루를 두 번 세지 않는다', () => {
    // 하루 중복은 그대로 금액 오차가 된다.
    const id = makeDebt();
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-01-01' });
    setDebtRate(db, id, { annual_rate: 4.55, effective_from: '2026-04-01' });
    const segs = rateTimeline(db, id, '2026-01-01', '2026-07-01');
    assert.strictEqual(segs[0].to, segs[1].from);
  });

  test('H-3. 이력이 없으면 빈 배열', () => {
    const id = makeDebt();
    db.prepare('DELETE FROM debt_rate_history WHERE debt_id=?').run(id);
    assert.deepStrictEqual(rateTimeline(db, id, '2026-01-01', '2026-02-01'), []);
  });
});

describe('I. 변동금리 검산 — 실제 계좌 조건', () => {
  // 한도 4,800,000 / 사용 3,566,196 / 연 4.17% (3개월 주기 변동)
  const BALANCE = 3566196;
  const daily = (bal, rate) => (bal * (rate / 100)) / 365;

  test('I-1. 30일 이자 — 4.17%', () => {
    assert.strictEqual(Math.floor(daily(BALANCE, 4.17) * 30), 12222);
  });

  test('I-2. 금리가 바뀐 60일을 시점별로 계산한다', () => {
    const id = makeDebt({ balance: BALANCE, annual_rate: 4.17, type: '마이너스통장',
      loan_type: 'credit_line', credit_limit: 4800000 });
    db.prepare('DELETE FROM debt_rate_history WHERE debt_id=?').run(id);
    setDebtRate(db, id, { annual_rate: 4.17, effective_from: '2026-03-01' });
    setDebtRate(db, id, { annual_rate: 4.55, effective_from: '2026-03-31' });

    const segs = rateTimeline(db, id, '2026-03-01', '2026-04-30');
    const total = segs.reduce((sum, s) => sum + Math.floor(daily(BALANCE, s.annual_rate) * days(s.from, s.to)), 0);

    assert.strictEqual(total, 25558);
    // 지금 금리로 소급 계산하면 이 값이 나온다 — 1,115원 어긋난다.
    assert.notStrictEqual(total, Math.floor(daily(BALANCE, 4.55) * 60));
  });

  function days(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }
});

describe('J. 금리 입력 검증', () => {
  const cases = [
    { name: '숫자가 아니면 거부', input: { annual_rate: Number('abc'), effective_from: '2026-01-01' }, fails: true },
    { name: '범위 밖 거부', input: { annual_rate: 101, effective_from: '2026-01-01' }, fails: true },
    { name: '음수 거부', input: { annual_rate: -1, effective_from: '2026-01-01' }, fails: true },
    { name: '날짜 형식 거부', input: { annual_rate: 4.17, effective_from: '2026/01/01' }, fails: true },
    { name: '날짜 누락 거부', input: { annual_rate: 4.17 }, fails: true },
    { name: '정상 통과', input: { annual_rate: 4.17, effective_from: '2026-01-01' }, fails: false },
  ];
  for (const c of cases) {
    test(`J. ${c.name}`, () => {
      const r = validateRateChange(c.input);
      if (c.fails) {
        assert.ok(r);
        for (const bad of ['annual_rate', 'effective_from']) assert.ok(!r.includes(bad));
      } else {
        assert.strictEqual(r, null);
      }
    });
  }
});

describe('K. general 전략 — 기존 동작 보존', () => {
  test('K-1. 월 이자가 종전 SQL 과 같다', () => {
    // ROUND(balance * annual_rate / 100.0 / 12)
    assert.strictEqual(generalLoan.monthlyInterest({ balance: 1200000, annualRate: 12 }), 12000);
    assert.strictEqual(generalLoan.monthlyInterest({ balance: 1000000, annualRate: 12 }), 10000);
  });

  test('K-2. 반올림 기준이 SQL ROUND 와 같다', () => {
    const balance = 1000000, rate = 4.17;
    const sql = db.prepare('SELECT ROUND(? * ? / 100.0 / 12) AS v').get(balance, rate).v;
    assert.strictEqual(generalLoan.monthlyInterest({ balance, annualRate: rate }), sql);
  });

  test('K-3. 숫자가 아니면 실패한다', () => {
    assert.throws(() => generalLoan.monthlyInterest({ balance: NaN, annualRate: 5 }));
  });
});
