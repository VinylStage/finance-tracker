import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 페이지가 **실제로 렌더되는지** 만 본다(감사 S2).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//
// 리팩터링 중 import 를 빠뜨린 채 식별자를 쓰는 코드가 들어갔고, 테스트 1,600개가
// 전부 초록인데 브라우저에서 ReferenceError 로 앱이 죽었다. 감사에서 원인을 찾았다 —
// **그 페이지를 렌더하는 테스트가 하나도 없었다.** 12개 페이지 중 8개가 그랬다.
//
// 각 페이지의 동작을 세밀하게 검증하는 것은 이 파일의 몫이 아니다. 여기서 잡는
// 것은 딱 하나, "열면 죽는가" 다. 그 한 줄이 없어서 앱이 죽은 채로 배포됐다.
//
// ─────────────────────────────────────────────────────────────────────────
// 로딩 상태에서 멈추면 아무것도 증명하지 못한다
//
// 페이지는 전부 `if (loading) return <로딩 중...>` 으로 일찍 빠져나간다. 렌더만
// 하고 단언하면 **로딩 껍데기만 보고 통과**한다 — 본문은 한 줄도 안 돈다.
//
// 그래서 두 가지를 함께 요구한다.
//   1. 로딩이 걷힐 때까지 기다린다        → 본문이 실제로 렌더된다
//   2. 에러 화면이 아니어야 한다          → 응답 모양이 맞아 본문이 끝까지 돈다
// 둘 중 하나만 보면 다시 빈 통과로 돌아간다.
// ─────────────────────────────────────────────────────────────────────────

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

// 실제 api 객체(lib/api.js)의 표면을 그대로 흉내낸다. 없는 이름을 지어내면
// 화면이 그것을 불러도 테스트만 통과한다(#402 가 실제로 그랬다).
vi.mock('../lib/api', () => ({
  api: { get, post, put, del, raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

const navigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/', navigate],
  Link: ({ children }) => <span>{children}</span>,
}));

// **빈 응답으로는 아무것도 증명하지 못한다.**
//
// 처음엔 전부 빈 배열을 줬더니 8개 페이지가 전부 통과했는데, Dashboard 에서
// budgetLabel import 를 지워도 그대로 통과했다 — 그 식별자가 있는 자리가
// `data.budgets.map(...)` 안이라 목록이 비면 한 번도 안 돈다. 사고를 못 잡는
// 스모크는 스모크가 아니다.
//
// 그래서 목록마다 **최소 한 건**을 채운다. 채운 건수가 아니라 "분기가 도는가"
// 가 목적이라 한 건이면 족하다. 모양은 서버 라우트가 실제로 내려주는 필드를
// 따른다 — 틀리면 페이지가 에러 화면으로 떨어져 이 테스트가 실패한다.
const SHAPES = [
  [/^\/api\/categories/, [
    { id: 1, name: '식비', major_type: '선택지출', monthly_budget: 300000, is_active: 1 },
    { id: 2, name: '월급', major_type: '수입', monthly_budget: null, is_active: 1 },
  ]],
  [/^\/api\/payment-methods/, [
    { id: 1, name: '하나카드', type: '신용', is_active: 1 },
    { id: 7, name: '현금', type: '현금성', is_active: 1 },
  ]],
  [/^\/api\/settings/, { initial_balance: 0, monthly_income: 0 }],
  // 가이드는 JSON 이 아니라 마크다운 **텍스트**를 준다(라우트가 text/markdown 으로
  // 보낸다). 객체를 주면 마크다운 렌더러가 children 에 객체를 받아 터진다.
  [/^\/api\/guide/, '# 가이드\n\n첫 거래를 추가해 보세요.\n'],
  [/^\/api\/transactions\/years/, { data: ['2026'] }],
  [/^\/api\/transactions\/summary\/dashboard/, {
    thisMonth: '2026-08', income: 3000000, expense: 1200000,
    available: 1500000, installmentsDue: 200000, revolvingPaid: 100000,
    // budgetLabel 이 도는 자리가 여기다. 비우면 그 코드가 한 줄도 안 돈다.
    budgets: [{ name: '식비', major_type: '선택지출', monthly_budget: 300000, spent: 250000 }],
    categoryBreakdown: [{ category: '식비', major_type: '선택지출', total: 250000, budget: 300000 }],
    dailyTrend: [{ date: '2026-08-01', income: 0, expense: 12000 }],
    weeklyTrend: [{ week: '2026-W31', income: 0, expense: 12000 }],
    monthlyTrend: [{ month: '2026-08', income: 3000000, expense: 1200000 }],
    topMerchants: [{ merchant: '스타벅스', total: 45000, count: 9 }],
  }],
  [/^\/api\/transactions\/summary\/category-breakdown/, {
    data: [{ category: '식비', major_type: '선택지출', total: 250000, budget: 300000 }],
  }],
  [/^\/api\/transactions\/summary\/by-month/, {
    data: [{ month: '2026-08', income: 3000000, expense: 1200000, count: 12 }],
  }],
  [/^\/api\/transactions\/period-comparison/, {
    summary: {
      currentIncome: 0, previousIncome: 0, incomeDiff: 0, incomeDiffPercent: null,
      currentExpense: 0, previousExpense: 0, expenseDiff: 0, expenseDiffPercent: null,
      currentNet: 0, previousNet: 0, netDiff: 0, netDiffPercent: null,
    },
    data: [{
      label: '1', currentDate: '2026-08-01', previousDate: '2026-07-01',
      currentIncome: 0, currentExpense: 12000, previousIncome: 0, previousExpense: 9000,
    }],
    currentLabel: '2026-08', previousLabel: '2026-07',
    currentRange: ['2026-08-01', '2026-08-31'], previousRange: ['2026-07-01', '2026-07-31'],
  }],
  [/^\/api\/transactions/, {
    data: [{
      id: 1, date: '2026-08-01', category_id: 1, category_name: '식비', major_type: '선택지출',
      amount: 12000, payment_method_id: 1, payment_method_name: '하나카드', card_product_id: null,
      payment_style: '일시불', merchant: '스타벅스', memo: null, origin: 'manual',
      settlement: 'immediate', billing_month: null,
    }],
    total: 1,
  }],
  [/^\/api\/recurring-rules\/due/, { data: [] }],
  // 카드 전략(#277). thresholds 는 배열을, comparison 은 비교 결과를 준다.
  // 목록을 비우면 카드 행을 그리는 코드가 한 줄도 안 돈다 — 한 건씩 채운다.
  [/^\/api\/card-strategy\/thresholds/, {
    data: [{
      cardProductId: 1, issuer: '하나카드', productName: '하나 원더카드',
      isActive: true, required: 300000, spend: 320000, met: true, estimated: false,
    }],
    asOf: '2026-08-05',
  }],
  [/^\/api\/card-strategy\/comparison/, {
    comparable: true,
    totalGap: 12000,
    byCard: [{ cardId: 1, productName: '하나 원더카드', gapIfUsed: 12000 }],
    details: [{
      id: 1, date: '2026-07-13', merchant: '스타벅스', amount: 4500,
      actualCard: '하나 원더카드', bestCard: '하나 트래블로그', gap: 300,
    }],
    unknownCard: 0,
    period: { from: '2026-05-05', to: '2026-08-05' },
    thresholdEstimated: false,
  }],
  // 파생 거래는 별도 엔드포인트다. 일반 목록 패턴보다 **먼저** 와야 한다 —
  // 뒤에 두면 할부 행이 파생 거래 자리에 실려 렌더가 터진다.
  // 중복 후보는 한 건이 { transaction, confidence, ... } 다. 일반 목록 모양을
  // 주면 c.transaction 이 undefined 라 렌더가 터진다 — 실제로 여기서 걸렸다.
  [/^\/api\/installments\/duplicates/, {
    data: [{
      transaction: { id: 91, date: '2026-08-01', merchant: '노트북', amount: 100000 },
      confidence: 'review',
      installment_id: 1,
      installment_merchant: '노트북',
    }],
    total_amount: 100000,
    day_window: 14,
  }],
  [/^\/api\/(?:installments|revolving|debts)\/\d+\/derived/, {
    data: [{
      id: 11, date: '2026-08-05', merchant: '노트북 1/12', amount: 100000,
      category_id: 1, origin: 'installment', origin_seq: 1, origin_seq_total: 12,
    }],
  }],
  [/^\/api\/installments/, {
    data: [{
      id: 1, purchase_date: '2026-06-10', merchant: '노트북', total_amount: 1200000,
      months: 12, monthly_amount: 100000, fee_per_month: 0, payment_method_id: 1,
      payment_method_name: '하나카드', start_billing_month: '2026-07', status: '진행중',
      remaining_months: 10, billed_months: 2, can_reopen: false,
      reopen_blocked_reason: null, billing_ends_on: '2027-06-30',
    }],
    this_month_total: 100000,
  }],
  [/^\/api\/revolving/, {
    data: [{
      id: 1, month: '2026-08', payment_method_id: 1, payment_method_name: '하나카드',
      carried_amount: 500000, paid_amount: 100000, fee: 12000, rate: 19.9,
    }],
  }],
  [/^\/api\/debts\/\d+\/interest-log/, { data: [] }],
  [/^\/api\/debts\/\d+\/repayments/, { data: [] }],
  [/^\/api\/debts/, {
    data: [{
      id: 1, name: '마이너스통장', loan_type: 'credit_line', balance: 3000000,
      credit_limit: 5000000, rate: 6.5, compounds: 0, interest_day: 25, is_active: 1,
    }],
  }],
  [/^\/api\/card-products\/billing-month/, { billing_month: null, resolved: false }],
  [/^\/api\/card-products/, {
    data: [{
      id: 1, payment_method_id: 1, issuer: '하나카드', product_name: '하나 원더카드',
      card_type: '신용', annual_fee: 0, payment_method_name: '하나카드',
    }],
  }],
  [/^\/api\/accounts/, { data: [] }],
];

function responseFor(path) {
  for (const [re, body] of SHAPES) if (re.test(path)) return body;
  return { data: [] };
}

// 렌더 중 터진 예외를 **이 테스트의 단언으로** 잡는다.
//
// 경계 없이 두면 vitest 가 "Unhandled Errors" 로만 보고한다. 종료코드는 1 이라
// CI 는 막히지만, 테스트 자체는 "passed" 로 표시돼 어느 페이지가 죽었는지가
// 결과에 안 남는다. 경계로 받아 두면 실패가 그 페이지에 붙는다.
class CrashBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div data-testid="smoke-crash">{String(this.state.error)}</div>;
    }
    return this.props.children;
  }
}

// React 는 훅 규칙 위반 같은 것을 던지지 않고 콘솔로만 알리는 경우가 있어
// 콘솔도 함께 본다.
let consoleErrors;

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  get.mockImplementation((path) => Promise.resolve(responseFor(String(path))));
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});

const PAGES = [
  ['Dashboard', () => import('./Dashboard')],
  ['Transactions', () => import('./Transactions')],
  ['Debts', () => import('./Debts')],
  ['Installments', () => import('./Installments')],
  ['Revolving', () => import('./Revolving')],
  ['Comparison', () => import('./Comparison')],
  ['Simulator', () => import('./Simulator')],
  ['Guide', () => import('./Guide')],
  // #400 으로 들어온 화면이라 감사 S2 가 센 미렌더 목록에는 없었다. 전용
  // 테스트(CardStrategy.test.jsx)는 흐린 표시를 보고, 여기서는 "열면 죽는가"만 본다.
  ['CardStrategy', () => import('./CardStrategy')],
];

describe('페이지 스모크 렌더', () => {
  for (const [name, load] of PAGES) {
    it(`${name} 은 열면 죽지 않는다`, async () => {
      const { default: Page } = await load();

      render(
        <CrashBoundary>
          <ConfirmProvider>
            <Page />
          </ConfirmProvider>
        </CrashBoundary>
      );

      // 1. 로딩이 걷혀야 본문이 돈다. 이걸 안 기다리면 껍데기만 보고 통과한다.
      await waitFor(() => {
        expect(screen.queryByText(/로딩 중/)).toBeNull();
      });

      // 2. 렌더 중 터졌으면 여기서 잡힌다. 메시지를 그대로 실패에 싣는다.
      const crash = screen.queryByTestId('smoke-crash');
      expect(crash && crash.textContent).toBeFalsy();

      // 3. 에러 화면이면 본문이 끝까지 안 돈 것이다 — 통과시키면 안 된다.
      expect(screen.queryByText(/다시 시도/)).toBeNull();

      // 4. 던지지 않고 콘솔로만 알리는 것들.
      const fatal = consoleErrors.filter((e) => /is not defined|is not a function|Cannot read/.test(e));
      expect(fatal).toEqual([]);
    });
  }
});
