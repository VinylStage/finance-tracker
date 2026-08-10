import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 '카테고리 관리' 절.
//
// 절 단위로 파일을 나눈다. 설정 화면은 절이 열두 개고 '추가'·'저장'·'수정' 같은
// 글자가 여러 절에 겹친다. 한 파일에 몰면 다른 절 작업과 서로 밟는다.
//
// 이 절의 핵심은 **PUT 이 부분 갱신이 아니라는 것**이다. 서버는 레코드 전체를
// 덮고 major_type 을 검증한다(routes/categories.js). 일부만 보내면 400 이거나
// 나머지 필드가 지워진다. 보내는 몸통을 필드 단위로 잠근다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const ACTIVE = { id: 11, major_type: '선택지출', name: '커피', monthly_budget: 50000, is_active: 1 };
// 활성/비활성은 다른 축이다. 한 픽스처로 겸하면 비활성 분기를 영영 안 밟는다.
const INACTIVE = { id: 12, major_type: '변동필수', name: '헬스장', monthly_budget: 0, is_active: 0 };

function mockApi({ categories = [ACTIVE, INACTIVE] } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve(categories);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: [] });
    return Promise.resolve([]);
  });
  post.mockResolvedValue({ id: 99 });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const categorySection = async () => {
  const h = await screen.findByRole('heading', { name: '카테고리 관리' });
  return within(h.closest('section'));
};

const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('목록과 활성 필터', () => {
  it('기본은 활성 항목만 보여준다', async () => {
    renderSettings();
    const cat = await categorySection();

    expect(cat.getByText('커피')).toBeTruthy();
    expect(cat.queryByText('헬스장')).toBeNull();
  });

  it('비활성 항목 보기로 넘기면 함께 보여준다', async () => {
    renderSettings();
    const cat = await categorySection();

    await userEvent.click(cat.getByRole('button', { name: '비활성 항목 보기' }));

    expect(cat.getByText('헬스장')).toBeTruthy();
    expect(cat.getByText('커피')).toBeTruthy();
  });

  it('다시 누르면 활성만으로 돌아온다', async () => {
    renderSettings();
    const cat = await categorySection();

    await userEvent.click(cat.getByRole('button', { name: '비활성 항목 보기' }));
    await userEvent.click(cat.getByRole('button', { name: '활성 항목만 보기' }));

    expect(cat.queryByText('헬스장')).toBeNull();
  });

  it('활성 여부에 따라 다른 버튼을 준다', async () => {
    renderSettings();
    const cat = await categorySection();
    await userEvent.click(cat.getByRole('button', { name: '비활성 항목 보기' }));

    // 활성 항목에 재활성화가, 비활성 항목에 비활성화가 붙으면 반대로 동작한다.
    expect(cat.getAllByRole('button', { name: '비활성화' })).toHaveLength(1);
    expect(cat.getAllByRole('button', { name: '재활성화' })).toHaveLength(1);
  });
});

describe('카테고리 추가', () => {
  const openForm = async (cat) => {
    await userEvent.click(cat.getByRole('button', { name: '+ 추가' }));
  };

  it('추가 버튼이 폼을 열고 닫는다', async () => {
    renderSettings();
    const cat = await categorySection();

    await openForm(cat);
    expect(cat.getByLabelText('이름')).toBeTruthy();

    await openForm(cat);
    expect(cat.queryByLabelText('이름')).toBeNull();
  });

  it('유형 기본값은 선택지출이다', async () => {
    renderSettings();
    const cat = await categorySection();
    await openForm(cat);

    expect(cat.getByLabelText('유형').value).toBe('선택지출');
  });

  it('예산을 비우면 빈 문자열이 아니라 0 으로 보낸다', async () => {
    renderSettings();
    const cat = await categorySection();
    await openForm(cat);

    await userEvent.type(cat.getByLabelText('이름'), '취미');
    await userEvent.click(cat.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/categories', {
      major_type: '선택지출', name: '취미', monthly_budget: 0,
    }));
  });

  it('예산을 넣으면 숫자로 보낸다', async () => {
    renderSettings();
    const cat = await categorySection();
    await openForm(cat);

    await userEvent.selectOptions(cat.getByLabelText('유형'), '저축');
    await userEvent.type(cat.getByLabelText('이름'), '비상금');
    await userEvent.type(cat.getByLabelText('월 예산'), '300000');
    await userEvent.click(cat.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/categories', {
      major_type: '저축', name: '비상금', monthly_budget: 300000,
    }));
    expect(typeof post.mock.calls[0][1].monthly_budget).toBe('number');
  });

  it('추가에 성공하면 폼을 닫고 입력을 비운다', async () => {
    renderSettings();
    const cat = await categorySection();
    await openForm(cat);

    await userEvent.type(cat.getByLabelText('이름'), '취미');
    await userEvent.click(cat.getByRole('button', { name: '추가' }));
    await waitFor(() => expect(cat.queryByLabelText('이름')).toBeNull());

    // 값이 남아 있으면 다음에 열었을 때 지난 입력이 그대로 보인다.
    await openForm(cat);
    expect(cat.getByLabelText('이름').value).toBe('');
  });

  it('추가에 성공하면 목록을 다시 읽는다', async () => {
    renderSettings();
    const cat = await categorySection();
    const before = get.mock.calls.length;
    await openForm(cat);

    await userEvent.type(cat.getByLabelText('이름'), '취미');
    await userEvent.click(cat.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('추가가 실패하면 폼을 열어 둔 채 알린다', async () => {
    post.mockRejectedValue(new Error('같은 이름의 카테고리가 있습니다'));
    renderSettings();
    const cat = await categorySection();
    await openForm(cat);

    await userEvent.type(cat.getByLabelText('이름'), '커피');
    await userEvent.click(cat.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('같은 이름의 카테고리가 있습니다')).toBeTruthy();
    expect(cat.getByLabelText('이름').value).toBe('커피');
  });
});

describe('월 예산 즉시 수정', () => {
  it('칸에서 포커스가 빠지면 그 값으로 저장한다', async () => {
    renderSettings();
    const cat = await categorySection();

    const input = cat.getByLabelText('커피 월 예산');
    await userEvent.clear(input);
    await userEvent.type(input, '70000');
    await userEvent.tab();

    // 예산만 보내면 서버가 나머지를 덮어 지운다. 레코드 전체를 실어야 한다.
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/categories/11', {
      ...ACTIVE, monthly_budget: 70000,
    }));
  });

  it('비우면 0 으로 저장한다', async () => {
    renderSettings();
    const cat = await categorySection();

    await userEvent.clear(cat.getByLabelText('커피 월 예산'));
    await userEvent.tab();

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/categories/11',
      expect.objectContaining({ monthly_budget: 0 })));
  });

  it('저장이 실패하면 알린다', async () => {
    put.mockRejectedValue(new Error('예산은 0 이상이어야 합니다'));
    renderSettings();
    const cat = await categorySection();

    await userEvent.clear(cat.getByLabelText('커피 월 예산'));
    await userEvent.type(cat.getByLabelText('커피 월 예산'), '-1');
    await userEvent.tab();

    expect(await screen.findByText('예산은 0 이상이어야 합니다')).toBeTruthy();
  });
});

describe('행 안에서 수정', () => {
  const startEdit = async (cat) => {
    await userEvent.click(cat.getAllByRole('button', { name: '수정' })[0]);
  };

  it('현재 값을 채운 편집 행으로 바뀐다', async () => {
    renderSettings();
    const cat = await categorySection();
    await startEdit(cat);

    expect(cat.getByLabelText('커피 유형 수정').value).toBe('선택지출');
    expect(cat.getByLabelText('커피 이름 수정').value).toBe('커피');
    expect(cat.getByLabelText('커피 월 예산 수정').value).toBe('50000');
  });

  it('저장하면 바꾼 값만 얹어 전체를 보낸다', async () => {
    renderSettings();
    const cat = await categorySection();
    await startEdit(cat);

    await userEvent.clear(cat.getByLabelText('커피 이름 수정'));
    await userEvent.type(cat.getByLabelText('커피 이름 수정'), '카페');
    await userEvent.selectOptions(cat.getByLabelText('커피 유형 수정'), '고정지출');
    await userEvent.click(cat.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/categories/11', {
      ...ACTIVE, name: '카페', major_type: '고정지출', monthly_budget: 50000,
    }));
  });

  it('저장하면 편집 행을 닫고 목록을 다시 읽는다', async () => {
    renderSettings();
    const cat = await categorySection();
    const before = get.mock.calls.length;
    await startEdit(cat);

    await userEvent.click(cat.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(cat.queryByLabelText('커피 이름 수정')).toBeNull());
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('취소하면 아무것도 보내지 않고 닫는다', async () => {
    renderSettings();
    const cat = await categorySection();
    await startEdit(cat);

    await userEvent.clear(cat.getByLabelText('커피 이름 수정'));
    await userEvent.type(cat.getByLabelText('커피 이름 수정'), '지워질값');
    await userEvent.click(cat.getByRole('button', { name: '취소' }));

    expect(cat.queryByLabelText('커피 이름 수정')).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 편집 행을 닫지 않는다', async () => {
    put.mockRejectedValue(new Error('이름은 비울 수 없습니다'));
    renderSettings();
    const cat = await categorySection();
    await startEdit(cat);

    await userEvent.click(cat.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('이름은 비울 수 없습니다')).toBeTruthy();
    // 닫히면 고치던 값이 통째로 날아간다.
    expect(cat.getByLabelText('커피 이름 수정')).toBeTruthy();
  });

  it('다른 행의 수정을 누르면 그 행의 값으로 바뀐다', async () => {
    renderSettings();
    const cat = await categorySection();
    await userEvent.click(cat.getByRole('button', { name: '비활성 항목 보기' }));

    await userEvent.click(cat.getAllByRole('button', { name: '수정' })[0]);
    expect(cat.getByLabelText('커피 이름 수정').value).toBe('커피');

    await userEvent.click(cat.getAllByRole('button', { name: '수정' })[0]);
    expect(cat.queryByLabelText('커피 이름 수정')).toBeNull();
    expect(cat.getByLabelText('헬스장 이름 수정').value).toBe('헬스장');
  });
});

describe('비활성화', () => {
  it('확인하면 비활성화하고 목록을 다시 읽는다', async () => {
    renderSettings();
    const cat = await categorySection();
    const before = get.mock.calls.length;

    await userEvent.click(cat.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/categories/11'));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('취소하면 아무것도 하지 않는다', async () => {
    renderSettings();
    const cat = await categorySection();

    await userEvent.click(cat.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('실패하면 사유를 알린다', async () => {
    del.mockRejectedValue(new Error('사용 중인 카테고리입니다'));
    renderSettings();
    const cat = await categorySection();

    await userEvent.click(cat.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('사용 중인 카테고리입니다')).toBeTruthy();
  });
});

describe('재활성화', () => {
  const reactivate = async () => {
    renderSettings();
    const cat = await categorySection();
    await userEvent.click(cat.getByRole('button', { name: '비활성 항목 보기' }));
    await userEvent.click(cat.getByRole('button', { name: '재활성화' }));
    return cat;
  };

  // PUT /api/categories/:id 는 부분 갱신이 아니다. major_type 이 없으면 서버가
  // 400 으로 막는다 — is_active 만 보내던 동안 이 버튼은 한 번도 성공한 적이
  // 없고, 사용자에게는 "major_type must be one of ..." 라는 영문만 떴다.
  it('레코드 전체에 is_active 를 얹어 보낸다', async () => {
    const cat = await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/categories/12', {
      ...INACTIVE, is_active: 1,
    }));
    expect(cat).toBeTruthy();
  });

  it('유형·이름·예산이 빠지지 않는다', async () => {
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const sent = put.mock.calls[0][1];
    // 하나라도 빠지면 서버가 그 칸을 지우거나(monthly_budget) 400 을 낸다(major_type).
    expect(sent.major_type).toBe('변동필수');
    expect(sent.name).toBe('헬스장');
    expect(sent.monthly_budget).toBe(0);
    expect(sent.is_active).toBe(1);
  });

  it('취소하면 보내지 않는다', async () => {
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(put).not.toHaveBeenCalled();
  });

  it('성공하면 목록을 다시 읽는다', async () => {
    renderSettings();
    const cat = await categorySection();
    await userEvent.click(cat.getByRole('button', { name: '비활성 항목 보기' }));
    const before = get.mock.calls.length;

    await userEvent.click(cat.getByRole('button', { name: '재활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('실패하면 사유를 알린다', async () => {
    put.mockRejectedValue(new Error('major_type must be one of 수입, 고정지출'));
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('major_type must be one of 수입, 고정지출')).toBeTruthy();
  });
});
