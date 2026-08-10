import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Installments from './Installments';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 할부 등록 폼과 목록의 행 동작.
//
// 목록 표시·완료/되돌리기는 Installments.test.jsx 가 이미 본다. 여기는 그
// 파일이 안 다루는 축만 잡는다 — 폼, 삭제, 청구내역 펼치기, 해시 진입.
// 같은 화면이라도 축이 다르면 파일을 나눈다(#480 이후 같은 방식).
//
// 자식 컴포넌트(InstallmentMonthsPicker · InstallmentBillingHint ·
// InstallmentRegenerate · DuplicateCandidates)는 각자 테스트가 있다. 여기서는
// 목으로 바꾸지 않고 그대로 띄우되 단언하지 않는다 — 배선이 끊기면 렌더가
// 깨지므로 그 자체가 신호다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 구매일·이번달 기본값이 오늘에서 온다. 실제 시계로 두면 달이 바뀌는 날 뒤집힌다.
vi.mock('../lib/date', () => ({
  localYMD: () => '2026-07-28',
  localYearMonth: () => '2026-07',
}));

const ROW = {
  id: 3, merchant: '노트북', total_amount: 1200000, monthly_amount: 200000,
  months: 6, billed_months: 2, remaining_months: 4, status: '진행중',
  payment_method_name: '신한카드', can_reopen: false, reopen_blocked_reason: null,
};
// 결제수단·잔여가 비어 있는 쪽. 한 픽스처로 겸하면 '—'·'-' 분기를 안 밟는다.
const BARE = {
  id: 4, merchant: '정수기', total_amount: 600000, monthly_amount: 100000,
  months: 6, billed_months: 6, remaining_months: 0, status: '완료',
  payment_method_name: null, can_reopen: false, reopen_blocked_reason: '청구가 끝났어요',
};

const METHODS = [{ id: 5, name: '신한카드' }, { id: 6, name: '현대카드' }];
const CATEGORIES = [
  { id: 1, name: '온라인쇼핑', major_type: '선택지출' },
  { id: 2, name: '급여', major_type: '수입' },
];

function mockGet({ rows = [ROW], billingMonth = { billing_month: '2026-09', resolved: true, card_product: { product_name: '신한 Deep Dream' } } } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/card-products/billing-month')) {
      return billingMonth === null
        ? Promise.reject(new Error('계산 실패'))
        : Promise.resolve({ data: billingMonth });
    }
    if (url.startsWith('/api/installments/duplicates')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/installments')) return Promise.resolve({ data: rows, this_month_total: 200000 });
    if (url === '/api/payment-methods') return Promise.resolve(METHODS);
    if (url === '/api/categories') return Promise.resolve({ data: CATEGORIES });
    if (url.includes('/derived')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/card-policies')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

const renderPage = () => render(<ConfirmProvider><Installments /></ConfirmProvider>);
const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
const dialog = () => screen.getByRole('dialog');

// 펼치면 InstallmentRegenerate 의 '청구 내역 만들기' 버튼이 함께 나타나 이름이
// 겹친다. 토글만 골라내려면 aria-expanded 를 가진 것으로 좁혀야 한다.
const toggles = () => screen.getAllByRole('button', { name: /청구 내역/ })
  .filter((b) => b.hasAttribute('aria-expanded'));
const toggle = () => {
  const found = toggles();
  expect(found).toHaveLength(1);
  return found[0];
};

const openForm = async () => {
  await userEvent.click(screen.getByRole('button', { name: '+ 할부 등록' }));
  return screen.findByLabelText('가맹점 *');
};

// jsdom 에 scrollIntoView 가 없다. useHashTarget 이 requestAnimationFrame 안에서
// 부르기 때문에 예외가 테스트 밖에서 터지고, vitest 가 unhandled error 로 세면서
// "false positive 가능" 을 경고한다 — 그러면 이 파일의 결과를 믿을 수 없다.
//
// 같은 스텁을 vitest.setup.js 에 넣는 PR(#479)이 아직 머지 전이라 여기서 막는다.
// 그쪽이 들어오면 이 조건이 거짓이 되어 그냥 지나간다.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet();
  // POST 를 URL 로 갈라 답한다. 하나로 뭉쳐 { id: 99 } 를 돌려주면
  // InstallmentBillingHint 가 res.data.fee_per_month 를 읽다 죽고, 폼이 열려
  // 있는 동안 화면이 통째로 언마운트된다 — 그러면 "폼이 닫혔다" 를 확인하려던
  // 단언이 "아무것도 없다" 로 통과해 버린다(돌연변이 I11 에서 실제로 그랬다).
  post.mockImplementation((url) => {
    if (url === '/api/installments/billing-estimate') {
      return Promise.resolve({ data: { monthly_amount: 200000, fee_per_month: 0, total_fee: 0, rows: [] } });
    }
    return Promise.resolve({ id: 99 });
  });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
  window.location.hash = '';
});

afterEach(() => { window.location.hash = ''; });

describe('등록 폼 열고 닫기', () => {
  it('버튼이 폼을 열고 닫는다', async () => {
    renderPage();
    await settled();

    await openForm();
    expect(screen.getByText('할부 등록')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '+ 할부 등록' }));
    expect(screen.queryByLabelText('가맹점 *')).toBeNull();
  });

  it('취소해도 닫힌다', async () => {
    renderPage();
    await settled();
    await openForm();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByLabelText('가맹점 *')).toBeNull();
  });

  it('구매일 기본값은 오늘이다', async () => {
    renderPage();
    await settled();
    await openForm();

    expect(screen.getByLabelText('구매일 *').value).toBe('2026-07-28');
  });
});

// #364. 지금까지는 '이번 달' 이 박혀 있었다. 7/28 구매인데 마감이 7/25 인
// 카드면 첫 청구는 9월이라 두 달 어긋나고, #269 의 파생 거래가 이 값을 그대로
// 써서 회차 전체가 잘못된 달에 쌓인다.
describe('청구 시작월 자동 계산', () => {
  it('구매일로 청구월을 물어 기본값을 채운다', async () => {
    renderPage();
    await settled();
    await openForm();

    await waitFor(() => expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/api/card-products/billing-month?purchase_date=2026-07-28')));
    await waitFor(() => expect(screen.getByLabelText('청구 시작월 *').value).toBe('2026-09'));
  });

  it('카드를 고르면 그 카드로 다시 계산한다', async () => {
    renderPage();
    await settled();
    await openForm();
    await waitFor(() => expect(screen.getByLabelText('청구 시작월 *').value).toBe('2026-09'));

    await userEvent.selectOptions(screen.getByLabelText('카드'), '6');

    // 카드마다 마감일이 달라 청구월이 달라진다. 안 물어보면 첫 카드 기준으로 굳는다.
    // 경로까지 함께 본다. payment_method_id=6 만 보면 개월수 선택기가 부르는
    // /api/card-policies/months 에 걸려, 청구월을 다시 안 물어도 통과한다.
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(
      /^\/api\/card-products\/billing-month\?.*payment_method_id=6/)));
  });

  it('계산 근거를 문구로 알린다', async () => {
    renderPage();
    await settled();
    await openForm();

    expect(await screen.findByText('신한 Deep Dream 청구주기로 계산했어요.')).toBeTruthy();
  });

  it('주기를 모르면 구매일의 달로 두고 확인을 요청한다', async () => {
    mockGet({ billingMonth: { billing_month: '2026-07', resolved: false, ambiguous: false } });
    renderPage();
    await settled();
    await openForm();

    expect(await screen.findByText(/카드 청구주기를 몰라 구매일의 달로 뒀어요/)).toBeTruthy();
  });

  it('주기가 여럿이면 그 사실을 밝힌다', async () => {
    mockGet({ billingMonth: { billing_month: '2026-07', resolved: false, ambiguous: true } });
    renderPage();
    await settled();
    await openForm();

    // '몰라서' 와 '여럿이라' 는 사용자가 할 일이 다르다 — 뭉뚱그리면 안 된다.
    expect(await screen.findByText(/청구주기가 다른 상품이 여럿이라/)).toBeTruthy();
  });

  it('계산이 실패해도 입력을 막지 않는다', async () => {
    mockGet({ billingMonth: null });
    renderPage();
    await settled();
    await openForm();

    // 기본값(이번 달)이 남고 안내 문구만 사라진다.
    await waitFor(() => expect(screen.getByLabelText('청구 시작월 *').value).toBe('2026-07'));
    expect(screen.queryByText(/청구주기로 계산했어요/)).toBeNull();
  });
});

// #316 과 같은 규칙. 실제 청구서가 계산과 다른 경우가 있고, 그때 사용자가
// 실제 값을 못 넣으면 가계부가 틀린 값을 강제하게 된다.
describe('직접 고친 값은 자동계산이 덮지 않는다', () => {
  it('청구 시작월을 고치면 다시 계산해도 그대로다', async () => {
    renderPage();
    await settled();
    await openForm();
    await waitFor(() => expect(screen.getByLabelText('청구 시작월 *').value).toBe('2026-09'));

    await userEvent.clear(screen.getByLabelText('청구 시작월 *'));
    await userEvent.type(screen.getByLabelText('청구 시작월 *'), '2026-11');

    // 카드를 바꾸면 계산이 다시 도는데, 고친 값을 덮으면 안 된다.
    await userEvent.selectOptions(screen.getByLabelText('카드'), '6');
    // 경로까지 함께 본다. payment_method_id=6 만 보면 개월수 선택기가 부르는
    // /api/card-policies/months 에 걸려, 청구월을 다시 안 물어도 통과한다.
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(
      /^\/api\/card-products\/billing-month\?.*payment_method_id=6/)));

    expect(screen.getByLabelText('청구 시작월 *').value).toBe('2026-11');
  });

  it('고친 뒤에는 계산 근거 문구도 내린다', async () => {
    renderPage();
    await settled();
    await openForm();
    await screen.findByText('신한 Deep Dream 청구주기로 계산했어요.');

    await userEvent.clear(screen.getByLabelText('청구 시작월 *'));
    await userEvent.type(screen.getByLabelText('청구 시작월 *'), '2026-11');

    // 사용자가 정한 값 옆에 "계산했어요" 가 남아 있으면 무엇이 참인지 헷갈린다.
    expect(screen.queryByText('신한 Deep Dream 청구주기로 계산했어요.')).toBeNull();
  });
});

describe('가맹점 분류 선택지', () => {
  it('수입 카테고리는 빼고 보여준다', async () => {
    renderPage();
    await settled();
    await openForm();

    const names = within(screen.getByLabelText('가맹점 분류')).getAllByRole('option')
      .map(o => o.textContent);
    expect(names).toEqual(['선택 안 함 (기본 정책)', '온라인쇼핑']);
    // 할부 정책은 지출에만 걸린다. 수입이 섞이면 엉뚱한 예외 정책이 잡힌다.
    expect(names).not.toContain('급여');
  });
});

describe('등록 전송', () => {
  const fill = async () => {
    await openForm();
    await userEvent.type(screen.getByLabelText('가맹점 *'), '노트북');
    await userEvent.type(screen.getByLabelText('총액 (원) *'), '1200000');
    await userEvent.type(screen.getByLabelText('월납부액 (원) *'), '200000');
    // 개월수는 required 다. 안 채우면 브라우저 검증이 제출 자체를 막아
    // 아래 단언이 전부 "안 불렸다" 로 실패한다.
    await userEvent.type(screen.getByLabelText(/^개월수/), '6');
  };

  it('숫자 칸을 숫자로 바꿔 보낸다', async () => {
    renderPage();
    await settled();
    await fill();
    await userEvent.selectOptions(screen.getByLabelText('카드'), '5');
    await userEvent.selectOptions(screen.getByLabelText('가맹점 분류'), '1');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/installments',
      expect.objectContaining({
        merchant: '노트북', total_amount: 1200000, monthly_amount: 200000,
        payment_method_id: 5, category_id: 1, purchase_date: '2026-07-28',
      })));
    const sent = post.mock.calls[0][1];
    expect(typeof sent.total_amount).toBe('number');
    expect(typeof sent.payment_method_id).toBe('number');
  });

  it('월 수수료를 비우면 0 으로 보낸다', async () => {
    renderPage();
    await settled();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    // '' 가 그대로 가면 무이자인지 미입력인지 서버가 구분할 수 없다.
    expect(post.mock.calls[0][1].fee_per_month).toBe(0);
  });

  it('카드와 분류를 안 고르면 null 로 보낸다', async () => {
    renderPage();
    await settled();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][1];
    expect(sent.payment_method_id).toBeNull();
    expect(sent.category_id).toBeNull();
  });

  it('성공하면 폼을 닫고 목록을 다시 읽는다', async () => {
    renderPage();
    await settled();
    const before = get.mock.calls.length;
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(screen.queryByLabelText('가맹점 *')).toBeNull());
    // 화면이 살아 있는 채로 폼만 닫혀야 한다. 이 줄이 없으면 렌더가 통째로
    // 죽어도 "폼이 없다" 가 참이라 통과한다.
    expect(screen.getByRole('heading', { name: '할부 관리' })).toBeTruthy();
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('실패하면 사유를 알리고 폼을 닫지 않는다', async () => {
    post.mockRejectedValue(new Error('같은 할부가 이미 있습니다'));
    renderPage();
    await settled();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText('같은 할부가 이미 있습니다')).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(screen.getByLabelText('가맹점 *').value).toBe('노트북');
  });
});

describe('삭제', () => {
  it('확인하면 삭제하고 다시 읽는다', async () => {
    renderPage();
    await settled();
    const before = get.mock.calls.length;

    await userEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/installments/3'));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('취소하면 삭제하지 않는다', async () => {
    renderPage();
    await settled();

    await userEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('실패하면 사유를 알린다', async () => {
    del.mockRejectedValue(new Error('연결된 거래가 있어요'));
    renderPage();
    await settled();

    await userEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('연결된 거래가 있어요')).toBeTruthy();
  });
});

describe('청구 내역 펼치기', () => {
  it('펼치면 그 할부의 파생거래를 부른다', async () => {
    renderPage();
    await settled();

    const t = toggle();
    expect(t.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(t);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/installments/3/derived'));
    expect(t.getAttribute('aria-expanded')).toBe('true');
  });

  it('다시 누르면 접는다', async () => {
    renderPage();
    await settled();
    const t = toggle();

    await userEvent.click(t);
    await waitFor(() => expect(t.getAttribute('aria-expanded')).toBe('true'));
    await userEvent.click(t);

    expect(t.getAttribute('aria-expanded')).toBe('false');
  });

  it('한 번에 한 줄만 펼친다', async () => {
    mockGet({ rows: [ROW, BARE] });
    renderPage();
    await settled();
    const [a, b] = toggles();

    await userEvent.click(a);
    await waitFor(() => expect(a.getAttribute('aria-expanded')).toBe('true'));
    await userEvent.click(b);

    await waitFor(() => expect(b.getAttribute('aria-expanded')).toBe('true'));
    expect(a.getAttribute('aria-expanded')).toBe('false');
  });

  it('거래내역에서 넘어오면 그 줄을 펼친 채로 연다', async () => {
    window.location.hash = '#installment-3';
    renderPage();
    await settled();

    await waitFor(() => expect(toggle().getAttribute('aria-expanded')).toBe('true'));
  });

  it('다른 화면의 해시로는 펼치지 않는다', async () => {
    window.location.hash = '#revolving-3';
    renderPage();
    await settled();

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('빈 값 표기', () => {
  it('결제수단이 없으면 —— 로, 잔여가 0 이면 - 로 적는다', async () => {
    mockGet({ rows: [BARE] });
    renderPage();
    await settled();

    expect(screen.getByRole('cell', { name: '—' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '-' })).toBeTruthy();
  });
});
