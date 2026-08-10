import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Savings from './Savings';
import { ConfirmProvider } from '../components/ConfirmProvider';

const { get, post, put, del, raw } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del, raw },
  ApiError: class ApiError extends Error {},
}));

// 오늘을 고정한다. 진행률은 오늘에서 파생되므로 실제 시계로 두면 같은 픽스처가
// 날마다 다른 회차를 내고, 그때그때 통과하는 테스트가 된다.
vi.mock('../lib/date', () => ({
  localYMD: () => '2026-08-06',
  localYearMonth: () => '2026-08',
}));

// 만기일이 있는 상품 — 진행바가 그려지는 쪽.
const RUNNING = {
  id: 7, name: '주택청약', monthly_contribution: 100000,
  start_date: '2026-02-06', maturity_date: '2026-12-06',
  expected_payout: 1030000, status: '진행중', category_id: 3,
};

// 만기일이 없는 상품 — 진행률이 정의되지 않는 쪽. 두 축을 한 픽스처로 겸하면
// "만기일 없음" 분기가 영영 안 밟힌다.
const NO_SCHEDULE = {
  id: 8, name: '자유적금', monthly_contribution: 50000,
  start_date: '2026-05-01', maturity_date: null,
  expected_payout: null, status: '완료', category_id: null,
};

const CATEGORIES = [
  { id: 3, name: '적금', major_type: '저축' },
  { id: 4, name: '청약', major_type: '저축' },
  { id: 9, name: '식비', major_type: '지출' },
];

function mockGet({ items = [RUNNING], categories = CATEGORIES, listError = null } = {}) {
  get.mockImplementation((url) => {
    if (url === '/api/savings') {
      return listError ? Promise.reject(listError) : Promise.resolve({ data: items });
    }
    if (url === '/api/categories') return Promise.resolve(categories);
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(<ConfirmProvider><Savings /></ConfirmProvider>);
}

const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

// 다이얼로그의 확인/취소를 누른다. 페이지 본문에도 '확인' 이 있을 수 있어
// role=dialog 안으로 한정한다.
function dialog() {
  return screen.getByRole('dialog');
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset(); raw.mockReset();
  post.mockResolvedValue({ ok: true });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('저축 목록', () => {
  it('상품 정보를 표로 보여준다', async () => {
    mockGet();
    renderPage();
    await settled();

    expect(screen.getByRole('cell', { name: '주택청약' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '100,000원' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2026-02-06' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2026-12-06' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '1,030,000원' })).toBeTruthy();
    expect(screen.getByText('진행중')).toBeTruthy();
  });

  it('만기일과 예상 수령액이 비어 있으면 —— 로 대신한다', async () => {
    mockGet({ items: [NO_SCHEDULE] });
    renderPage();
    await settled();

    // 만기일 칸과 예상수령액 칸 두 곳. 값이 있는 쪽과 섞이지 않게 개수로 잠근다.
    expect(screen.getAllByRole('cell', { name: '—' })).toHaveLength(2);
  });

  it('만기일이 없으면 진행바 대신 안내를 띄운다', async () => {
    mockGet({ items: [NO_SCHEDULE] });
    renderPage();
    await settled();

    expect(screen.getByText('만기일을 입력하면 목표 진행이 표시됩니다')).toBeTruthy();
  });

  it('만기일이 있으면 목표 진행을 계산해 보여준다', async () => {
    mockGet();
    renderPage();
    await settled();

    // 2026-02-06 ~ 2026-12-06 = 10회차, 오늘(2026-08-06) 기준 7회차 납입.
    // 목표 1,000,000 중 700,000 냈으므로 300,000 남음.
    expect(screen.getByText('300,000원 남음')).toBeTruthy();
    expect(screen.getByText('7/10회 · 700,000원')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('상품이 없으면 빈 상태를 보여준다', async () => {
    mockGet({ items: [] });
    renderPage();
    await settled();

    expect(screen.getByText('아직 저축 상품이 없어요')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('목록을 못 불러오면 에러와 재시도를 띄우고, 재시도가 다시 부른다', async () => {
    mockGet({ listError: new Error('서버에 연결할 수 없습니다') });
    renderPage();
    await settled();

    expect(screen.getByText('서버에 연결할 수 없습니다')).toBeTruthy();

    // 재시도 성공으로 갈아끼운 뒤 눌러야 '다시 불렀다' 를 결과로 확인할 수 있다.
    mockGet();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('cell', { name: '주택청약' })).toBeTruthy());
  });
});

describe('만기 처리', () => {
  it('진행중이 아니면 만기처리 버튼을 내린다', async () => {
    mockGet({ items: [NO_SCHEDULE] });
    renderPage();
    await settled();

    expect(screen.queryByRole('button', { name: '만기처리' })).toBeNull();
    // 수정·삭제는 상태와 무관하게 남는다.
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy();
  });

  it('확인하면 만기 처리하고 원금·이자·수령액을 알린다', async () => {
    mockGet();
    raw.mockResolvedValue({ principal: 1000000, interest: 30000, payout: 1030000 });
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '만기처리' }));
    expect(within(dialog()).getByText(/"주택청약" 만기 처리하시겠습니까\?/)).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(raw).toHaveBeenCalledWith('/api/savings/7/mature', { method: 'POST' }));

    const done = await screen.findByText(/만기 처리 완료/);
    expect(done.textContent).toContain('원금: 1,000,000원');
    expect(done.textContent).toContain('이자: 30,000원');
    expect(done.textContent).toContain('총 수령액: 1,030,000원');
  });

  it('만기 처리 뒤 목록을 다시 읽는다', async () => {
    mockGet();
    raw.mockResolvedValue({ principal: 1000000, interest: 30000, payout: 1030000 });
    renderPage();
    await settled();
    const before = get.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: '만기처리' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    await screen.findByText(/만기 처리 완료/);
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('취소하면 아무것도 부르지 않는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '만기처리' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(raw).not.toHaveBeenCalled();
  });

  it('만기 처리가 실패하면 서버 메시지를 알린다', async () => {
    mockGet();
    raw.mockRejectedValue(new Error('이미 만기 처리된 상품입니다'));
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '만기처리' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('이미 만기 처리된 상품입니다')).toBeTruthy();
  });

  it('메시지 없는 실패에도 안내를 띄운다', async () => {
    mockGet();
    raw.mockRejectedValue(new Error(''));
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '만기처리' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('처리 실패')).toBeTruthy();
  });
});

describe('삭제', () => {
  it('확인하면 삭제하고 목록을 다시 읽는다', async () => {
    mockGet();
    renderPage();
    await settled();
    const before = get.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/savings/7'));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('취소하면 삭제하지 않는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('삭제가 실패하면 서버 메시지를 알린다', async () => {
    mockGet();
    del.mockRejectedValue(new Error('연결된 거래가 있어 삭제할 수 없습니다'));
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('연결된 거래가 있어 삭제할 수 없습니다')).toBeTruthy();
  });
});

describe('등록 폼', () => {
  it('저축 카테고리만 고를 수 있다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));

    const select = screen.getByLabelText(/저축 카테고리/);
    const names = within(select).getAllByRole('option').map(o => o.textContent);
    expect(names).toEqual(['선택 안 함', '적금', '청약']);
    // 지출 카테고리가 섞이면 만기 시 원금 회수가 엉뚱한 분류로 기록된다.
    expect(names).not.toContain('식비');
  });

  it('시작일 기본값은 오늘이다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));
    expect(screen.getByLabelText('시작일 *').value).toBe('2026-08-06');
  });

  it('등록하면 숫자 칸을 숫자로 바꿔 보낸다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));
    await userEvent.type(screen.getByLabelText('상품명 *'), '정기적금');
    await userEvent.type(screen.getByLabelText('월 납입액 (원) *'), '200000');
    await userEvent.type(screen.getByLabelText('예상 수령액 (원)'), '2450000');
    await userEvent.selectOptions(screen.getByLabelText(/저축 카테고리/), '4');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/savings', expect.objectContaining({
      name: '정기적금',
      monthly_contribution: 200000,
      expected_payout: 2450000,
      category_id: 4,
      start_date: '2026-08-06',
    })));
    // 문자열로 새면 서버가 숫자 검증을 통과시키거나 조용히 0 으로 저장한다.
    const sent = post.mock.calls[0][1];
    expect(typeof sent.monthly_contribution).toBe('number');
    expect(typeof sent.expected_payout).toBe('number');
    expect(typeof sent.category_id).toBe('number');
  });

  it('선택 항목을 비우면 빈 문자열이 아니라 null 로 보낸다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));
    await userEvent.type(screen.getByLabelText('상품명 *'), '자유적금');
    await userEvent.type(screen.getByLabelText('월 납입액 (원) *'), '50000');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][1];
    expect(sent.expected_payout).toBeNull();
    expect(sent.category_id).toBeNull();
  });

  it('등록에 성공하면 폼을 닫고 목록을 다시 읽는다', async () => {
    mockGet();
    renderPage();
    await settled();
    const before = get.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));
    await userEvent.type(screen.getByLabelText('상품명 *'), '정기적금');
    await userEvent.type(screen.getByLabelText('월 납입액 (원) *'), '200000');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(screen.queryByLabelText('상품명 *')).toBeNull());
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('등록이 실패하면 폼을 열어 둔 채 알린다', async () => {
    mockGet();
    post.mockRejectedValue(new Error('같은 이름의 상품이 있습니다'));
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));
    await userEvent.type(screen.getByLabelText('상품명 *'), '정기적금');
    await userEvent.type(screen.getByLabelText('월 납입액 (원) *'), '200000');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText('같은 이름의 상품이 있습니다')).toBeTruthy();
    // 입력이 날아가면 사용자가 처음부터 다시 쳐야 한다.
    expect(screen.getByLabelText('상품명 *').value).toBe('정기적금');
  });

  it('취소하면 폼을 닫는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByLabelText('상품명 *')).toBeNull();
  });
});

describe('수정 폼', () => {
  it('선택한 상품 값을 채워서 연다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(screen.getByText('상품 수정')).toBeTruthy();
    expect(screen.getByLabelText('상품명 *').value).toBe('주택청약');
    expect(screen.getByLabelText('월 납입액 (원) *').value).toBe('100000');
    expect(screen.getByLabelText('시작일 *').value).toBe('2026-02-06');
    expect(screen.getByLabelText('만기일').value).toBe('2026-12-06');
    expect(screen.getByLabelText('예상 수령액 (원)').value).toBe('1030000');
    expect(screen.getByLabelText(/저축 카테고리/).value).toBe('3');
  });

  it('비어 있는 값은 빈 칸으로 연다', async () => {
    mockGet({ items: [NO_SCHEDULE] });
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    // null 이 'null' 문자열로 새면 date 입력이 값을 거부하거나 그대로 저장된다.
    expect(screen.getByLabelText('만기일').value).toBe('');
    expect(screen.getByLabelText('예상 수령액 (원)').value).toBe('');
    expect(screen.getByLabelText(/저축 카테고리/).value).toBe('');
  });

  it('저장하면 POST 가 아니라 해당 id 로 PUT 한다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    await userEvent.clear(screen.getByLabelText('월 납입액 (원) *'));
    await userEvent.type(screen.getByLabelText('월 납입액 (원) *'), '150000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/savings/7', expect.objectContaining({
      name: '주택청약',
      monthly_contribution: 150000,
    })));
    expect(post).not.toHaveBeenCalled();
  });

  it('수정하다 등록으로 넘어가면 이전 값이 남지 않는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByLabelText('상품명 *').value).toBe('주택청약');

    // 취소를 거치지 않고 바로 등록으로 간다. 취소 쪽에서도 editItem 을 비우기
    // 때문에 그 경로로 확인하면 등록 버튼의 초기화가 빠져도 통과한다.
    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));

    expect(screen.getByText('상품 등록')).toBeTruthy();
    expect(screen.getByLabelText('상품명 *').value).toBe('');
  });

  it('폼을 연 채 다른 상품을 수정하면 그 상품 값으로 바뀐다', async () => {
    mockGet({ items: [RUNNING, { ...NO_SCHEDULE, status: '진행중' }] });
    renderPage();
    await settled();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    expect(screen.getByLabelText('상품명 *').value).toBe('주택청약');

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[1]);
    expect(screen.getByLabelText('상품명 *').value).toBe('자유적금');
  });

  it('대상을 바꾼 뒤 저장하면 그 대상의 값을 그 id 로 보낸다', async () => {
    mockGet({ items: [RUNNING, { ...NO_SCHEDULE, status: '진행중' }] });
    renderPage();
    await settled();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[1]);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    // 화면에 남은 값과 전송 대상이 어긋나면, 사용자가 본 적 없는 값이
    // 다른 상품에 조용히 덮인다.
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/savings/8', expect.objectContaining({
      name: '자유적금',
      monthly_contribution: 50000,
    })));
  });

  it('취소로 닫았다 등록을 열어도 이전 값이 남지 않는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await userEvent.click(screen.getByRole('button', { name: '+ 상품 등록' }));

    expect(screen.getByText('상품 등록')).toBeTruthy();
    expect(screen.getByLabelText('상품명 *').value).toBe('');
  });
});
