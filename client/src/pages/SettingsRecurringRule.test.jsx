import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 '반복 거래 관리' 절.
//
// 절 단위로 파일을 나눈다 — 설정 화면은 절이 열두 개고 '추가'·'수정'·'비활성화'
// 같은 글자가 여러 절에 겹친다.
//
// 폼 값 변환과 검증 규칙 자체는 lib/recurringForm 의 테스트가 이미 본다.
// 여기서는 **화면이 그 규칙을 제대로 태우는가**만 잡는다 — 주기에 따라 어떤
// 입력을 띄우는지, 검증에 걸리면 요청을 안 보내는지, 무엇을 보내는지.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const CATEGORIES = [
  { id: 1, major_type: '고정지출', name: '구독료', is_active: 1 },
  { id: 2, major_type: '선택지출', name: '커피', is_active: 1 },
  // 비활성 카테고리는 새 규칙의 선택지가 되면 안 된다.
  { id: 3, major_type: '선택지출', name: '폐지된항목', is_active: 0 },
];
const METHODS = [{ id: 5, name: '하나카드', type: '신용', is_active: 1 }];

const ACTIVE_RULE = {
  id: 20, category_id: 1, category_name: '구독료', merchant: '넷플릭스',
  amount: 17000, freq: 'monthly', interval: 1, day_of_month: 15,
  month_of_year: null, starts_on: '2026-01-15', ends_on: null,
  payment_method_id: 5, payment_style: '일시불', memo: '', is_active: 1,
};
// 활성/비활성은 다른 축이다. 한 픽스처로 겸하면 비활성 분기를 안 밟는다.
const INACTIVE_RULE = {
  id: 21, category_id: 2, category_name: '커피', merchant: '옛날구독',
  amount: 5000, freq: 'yearly', interval: 2, day_of_month: 30,
  month_of_year: 3, starts_on: '2025-03-30', ends_on: null,
  payment_method_id: null, payment_style: '해당없음', memo: '메모', is_active: 0,
};

function mockApi({ rules = [ACTIVE_RULE, INACTIVE_RULE] } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve(CATEGORIES);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve(METHODS);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve(rules);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: [] });
    return Promise.resolve([]);
  });
  post.mockResolvedValue({ id: 99 });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const ruleSection = async () => {
  const h = await screen.findByRole('heading', { name: '반복 거래 관리' });
  return within(h.closest('section'));
};

const dialog = () => screen.getByRole('dialog');

// 반복규칙 목록 요청만 센다. 다른 절의 요청이 섞이면 재조회 여부를 못 본다.
const ruleCalls = () => get.mock.calls.filter(([url]) => url.startsWith('/api/recurring-rules'));

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
  // 거래내역 초안은 sessionStorage 에 남는다. 공용 셋업은 localStorage 만 비운다.
  window.sessionStorage.clear();
});

describe('목록', () => {
  it('규칙의 가맹점·카테고리·금액·일정을 보여준다', async () => {
    renderSettings();
    const sec = await ruleSection();

    expect(sec.getByRole('cell', { name: '넷플릭스' })).toBeTruthy();
    expect(sec.getByRole('cell', { name: '구독료' })).toBeTruthy();
    expect(sec.getByRole('cell', { name: '17,000원' })).toBeTruthy();
    expect(sec.getByRole('cell', { name: '매월 15일' })).toBeTruthy();
  });

  it('기본은 활성 규칙만 보여준다', async () => {
    renderSettings();
    const sec = await ruleSection();

    expect(sec.queryByRole('cell', { name: '옛날구독' })).toBeNull();
  });

  it('비활성 항목 보기로 넘기면 함께 보여주고 일정도 주기에 맞춘다', async () => {
    renderSettings();
    const sec = await ruleSection();

    await userEvent.click(sec.getByRole('button', { name: '비활성 항목 보기' }));

    expect(sec.getByRole('cell', { name: '옛날구독' })).toBeTruthy();
    expect(sec.getByRole('cell', { name: '2년마다 3월 30일' })).toBeTruthy();
  });

  it('활성 여부에 따라 다른 버튼을 준다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '비활성 항목 보기' }));

    expect(sec.getAllByRole('button', { name: '비활성화' })).toHaveLength(1);
    expect(sec.getAllByRole('button', { name: '재활성화' })).toHaveLength(1);
  });

  it('규칙이 없으면 안내 줄을 둔다', async () => {
    mockApi({ rules: [] });
    renderSettings();
    const sec = await ruleSection();

    expect(sec.getByText('등록된 반복 규칙이 없습니다.')).toBeTruthy();
  });
});

describe('주기에 따라 달라지는 입력', () => {
  const openAdd = async (sec) => {
    await userEvent.click(sec.getByRole('button', { name: '+ 추가' }));
  };

  it('추가 버튼이 폼을 열고, 그동안 취소로 바뀐다', async () => {
    renderSettings();
    const sec = await ruleSection();

    await openAdd(sec);
    expect(sec.getByLabelText('가맹점/이름')).toBeTruthy();

    await userEvent.click(sec.getByRole('button', { name: '취소' }));
    expect(sec.queryByLabelText('가맹점/이름')).toBeNull();
  });

  it('월 주기에는 며칠만 묻는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await openAdd(sec);

    expect(sec.getByLabelText('주기').value).toBe('monthly');
    expect(sec.getByLabelText('며칠')).toBeTruthy();
    expect(sec.queryByLabelText('몇 월')).toBeNull();
  });

  it('일 주기에는 며칠을 묻지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await openAdd(sec);

    await userEvent.selectOptions(sec.getByLabelText('주기'), 'daily');

    // 안 쓰는 입력을 남겨 두면 사용자가 정한 값이 저장은 되고 쓰이지는 않는다.
    expect(sec.queryByLabelText('며칠')).toBeNull();
    expect(sec.queryByLabelText('몇 월')).toBeNull();
  });

  it('연 주기에는 몇 월과 며칠을 함께 묻는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await openAdd(sec);

    await userEvent.selectOptions(sec.getByLabelText('주기'), 'yearly');

    expect(sec.getByLabelText('몇 월')).toBeTruthy();
    expect(sec.getByLabelText('며칠')).toBeTruthy();
  });

  it('활성 카테고리만 고를 수 있다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await openAdd(sec);

    const names = within(sec.getByLabelText('카테고리')).getAllByRole('option')
      .map(o => o.textContent);
    expect(names).toEqual(['선택...', '구독료', '커피']);
    expect(names).not.toContain('폐지된항목');
  });

  it('29일 이상을 고르면 말일 처리를 알려준다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await openAdd(sec);

    expect(sec.queryByText(/없는 달에는/)).toBeNull();

    await userEvent.clear(sec.getByLabelText('며칠'));
    await userEvent.type(sec.getByLabelText('며칠'), '31');

    // 안 알려주면 2월에 날짜가 다른 것을 버그로 읽는다(#278).
    expect(sec.getByText('31일이 없는 달에는 그 달 마지막 날에 생깁니다.')).toBeTruthy();
  });
});

describe('저장 전 검증', () => {
  const fill = async (sec, { category = '1', merchant = '유튜브', amount = '10900' } = {}) => {
    await userEvent.click(sec.getByRole('button', { name: '+ 추가' }));
    if (category) await userEvent.selectOptions(sec.getByLabelText('카테고리'), category);
    if (merchant) await userEvent.type(sec.getByLabelText('가맹점/이름'), merchant);
    if (amount) await userEvent.type(sec.getByLabelText('금액'), amount);
  };

  // 브라우저 기본 검증이 먼저 막는 것과, 화면 코드가 막는 것을 나눠 본다.
  // 둘을 뭉뚱그리면 어느 쪽이 일하고 있는지 모른 채 통과한다.
  it('간격이 0 이면 입력 제약이 먼저 막아 아예 제출되지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fill(sec);

    await userEvent.clear(sec.getByLabelText('간격'));
    await userEvent.type(sec.getByLabelText('간격'), '0');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    // min="1" 이 걸려 있어 submit 자체가 안 난다. 대화상자도 안 뜬다.
    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('공백만 넣은 가맹점은 화면 코드가 잡는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fill(sec, { merchant: null });

    // required 는 공백을 통과시킨다. 여기서부터가 validateForm 의 몫이다.
    await userEvent.type(sec.getByLabelText('가맹점/이름'), '   ');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('가맹점/이름을 입력해 주세요.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('종료일이 시작일보다 빠르면 알리고 보내지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fill(sec);

    await userEvent.type(sec.getByLabelText('종료일'), '2020-01-01');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('종료일이 시작일보다 빠를 수 없어요.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('연 주기인데 몇 월을 안 고르면 제출되지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fill(sec);

    await userEvent.selectOptions(sec.getByLabelText('주기'), 'yearly');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    // required 가 붙은 select 라 브라우저가 먼저 막는다.
    expect(post).not.toHaveBeenCalled();
  });

  it('검증에 걸려도 폼은 열린 채로 둔다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fill(sec);

    await userEvent.type(sec.getByLabelText('종료일'), '2020-01-01');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));
    await screen.findByText('종료일이 시작일보다 빠를 수 없어요.');
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    // 닫히면 입력이 통째로 날아간다.
    expect(sec.getByLabelText('가맹점/이름').value).toBe('유튜브');
  });
});

describe('등록', () => {
  const fillValid = async (sec) => {
    await userEvent.click(sec.getByRole('button', { name: '+ 추가' }));
    await userEvent.selectOptions(sec.getByLabelText('카테고리'), '1');
    await userEvent.type(sec.getByLabelText('가맹점/이름'), '유튜브');
    await userEvent.type(sec.getByLabelText('금액'), '10900');
  };

  it('숫자 칸을 숫자로 바꿔 보낸다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fillValid(sec);
    await userEvent.selectOptions(sec.getByLabelText('결제수단'), '5');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/recurring-rules',
      expect.objectContaining({
        category_id: 1, merchant: '유튜브', amount: 10900,
        freq: 'monthly', interval: 1, day_of_month: 1,
        payment_method_id: 5, payment_style: '일시불',
      })));
  });

  it('일 주기면 발생일을 null 로 보낸다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fillValid(sec);
    await userEvent.selectOptions(sec.getByLabelText('주기'), 'daily');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    // 보내면 안 쓰는 값이 저장돼, 나중에 월로 바꿨을 때 정한 적 없는 날짜가 나온다.
    expect(post.mock.calls[0][1].day_of_month).toBeNull();
    expect(post.mock.calls[0][1].month_of_year).toBeNull();
  });

  it('연 주기면 몇 월을 숫자로 함께 보낸다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fillValid(sec);
    await userEvent.selectOptions(sec.getByLabelText('주기'), 'yearly');
    await userEvent.selectOptions(sec.getByLabelText('몇 월'), '7');
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].month_of_year).toBe(7);
  });

  it('종료일을 비우면 무기한으로 보낸다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await fillValid(sec);
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    // '' 가 그대로 가면 서버가 빈 문자열을 날짜로 저장한다.
    expect(post.mock.calls[0][1].ends_on).toBeNull();
  });

  it('성공하면 폼을 닫고 입력을 비우고 목록을 다시 읽는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    const before = ruleCalls().length;
    await fillValid(sec);
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(sec.queryByLabelText('가맹점/이름')).toBeNull());
    expect(ruleCalls().length).toBeGreaterThan(before);

    await userEvent.click(sec.getByRole('button', { name: '+ 추가' }));
    expect(sec.getByLabelText('가맹점/이름').value).toBe('');
  });

  it('실패하면 사유를 알리고 폼을 닫지 않는다', async () => {
    post.mockRejectedValue(new Error('같은 규칙이 이미 있습니다'));
    renderSettings();
    const sec = await ruleSection();
    await fillValid(sec);
    await userEvent.click(sec.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('같은 규칙이 이미 있습니다')).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(sec.getByLabelText('가맹점/이름').value).toBe('유튜브');
  });
});

describe('수정', () => {
  it('규칙 값을 채워서 연다', async () => {
    renderSettings();
    const sec = await ruleSection();

    await userEvent.click(sec.getByRole('button', { name: '수정' }));

    expect(sec.getByLabelText('가맹점/이름').value).toBe('넷플릭스');
    expect(sec.getByLabelText('금액').value).toBe('17000');
    expect(sec.getByLabelText('며칠').value).toBe('15');
    expect(sec.getByLabelText('시작일').value).toBe('2026-01-15');
    expect(sec.getByLabelText('결제수단').value).toBe('5');
    expect(sec.getByRole('button', { name: '저장' })).toBeTruthy();
  });

  it('저장하면 POST 가 아니라 그 id 로 PUT 한다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '수정' }));

    await userEvent.clear(sec.getByLabelText('금액'));
    await userEvent.type(sec.getByLabelText('금액'), '19000');
    await userEvent.click(sec.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/recurring-rules/20',
      expect.objectContaining({ merchant: '넷플릭스', amount: 19000 })));
    expect(post).not.toHaveBeenCalled();
  });

  it('다른 규칙의 수정을 누르면 그 값으로 바뀐다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '비활성 항목 보기' }));

    await userEvent.click(sec.getAllByRole('button', { name: '수정' })[0]);
    expect(sec.getByLabelText('가맹점/이름').value).toBe('넷플릭스');

    await userEvent.click(sec.getAllByRole('button', { name: '수정' })[1]);
    expect(sec.getByLabelText('가맹점/이름').value).toBe('옛날구독');
    expect(sec.getByLabelText('주기').value).toBe('yearly');
    expect(sec.getByLabelText('몇 월').value).toBe('3');
  });
});

describe('비활성화와 재활성화', () => {
  it('비활성화는 확인을 받고 지운다', async () => {
    renderSettings();
    const sec = await ruleSection();
    const before = ruleCalls().length;

    await userEvent.click(sec.getByRole('button', { name: '비활성화' }));
    expect(within(dialog()).getByText(/이번 달 확인 목록에서 더 이상 나타나지 않습니다/)).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/recurring-rules/20'));
    await waitFor(() => expect(ruleCalls().length).toBeGreaterThan(before));
  });

  it('비활성화를 취소하면 지우지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();

    await userEvent.click(sec.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('재활성화는 확인 없이 규칙 값을 그대로 실어 보낸다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '비활성 항목 보기' }));

    await userEvent.click(sec.getByRole('button', { name: '재활성화' }));

    // 되살리는 쪽은 잃는 게 없어 확인을 받지 않는다. 대신 필드가 하나라도
    // 빠지면 서버가 그 칸을 지운다 — 전체 교체 PUT 이다.
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/recurring-rules/21', {
      category_id: 2, merchant: '옛날구독', amount: 5000, day_of_month: 30,
      payment_method_id: null, payment_style: '해당없음', memo: '메모', is_active: 1,
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('재활성화에 성공하면 목록을 다시 읽는다', async () => {
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '비활성 항목 보기' }));
    const before = ruleCalls().length;

    await userEvent.click(sec.getByRole('button', { name: '재활성화' }));

    await waitFor(() => expect(ruleCalls().length).toBeGreaterThan(before));
  });

  it('재활성화가 실패하면 사유를 알린다', async () => {
    put.mockRejectedValue(new Error('되살릴 수 없는 규칙입니다'));
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '비활성 항목 보기' }));

    await userEvent.click(sec.getByRole('button', { name: '재활성화' }));

    expect(await screen.findByText('되살릴 수 없는 규칙입니다')).toBeTruthy();
  });
});

// 거래내역에서 "반복으로 등록" 을 눌러 넘어온 경우(#280).
describe('거래내역에서 넘어온 초안', () => {
  const DRAFT = {
    category_id: '2', merchant: '스타벅스', amount: '5500',
    freq: 'monthly', interval: '1', day_of_month: '10', month_of_year: '',
    starts_on: '', ends_on: '', payment_method_id: '5',
    payment_style: '일시불', memo: '',
  };

  it('초안이 있으면 그 값으로 폼을 열고 무엇이 빠졌는지 알린다', async () => {
    window.sessionStorage.setItem('recurring-draft', JSON.stringify(DRAFT));
    renderSettings();
    const sec = await ruleSection();

    // 폼은 마운트 직후 이펙트가 열기 때문에 헤딩보다 한 틱 늦게 나타난다.
    expect((await sec.findByLabelText('가맹점/이름')).value).toBe('스타벅스');
    expect(sec.getByLabelText('금액').value).toBe('5500');
    // 날짜는 복사하지 않는다 — 안 알려주면 사용자가 빈 시작일을 못 보고 지나친다.
    expect(sec.getByText(/날짜는 복사하지 않았으니 시작일과 주기를 정해 주세요/)).toBeTruthy();
  });

  it('한 번 읽고 지운다', async () => {
    window.sessionStorage.setItem('recurring-draft', JSON.stringify(DRAFT));
    renderSettings();
    const sec = await ruleSection();
    await sec.findByLabelText('가맹점/이름');

    // 남겨 두면 그냥 설정을 열었을 때 지난 초안이 떠 있다.
    expect(window.sessionStorage.getItem('recurring-draft')).toBeNull();
  });

  it('초안이 없으면 폼을 열지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();

    expect(sec.queryByLabelText('가맹점/이름')).toBeNull();
    expect(sec.queryByText(/거래내역에서 값을 가져왔어요/)).toBeNull();
  });

  it('직접 추가로 연 폼에는 그 안내가 붙지 않는다', async () => {
    renderSettings();
    const sec = await ruleSection();

    await userEvent.click(sec.getByRole('button', { name: '+ 추가' }));

    expect(sec.queryByText(/거래내역에서 값을 가져왔어요/)).toBeNull();
    // 직접 열면 시작일이 오늘로 채워진다. 초안 경로는 비운 채로 둔다.
    expect(sec.getByLabelText('시작일').value).not.toBe('');
  });
});
