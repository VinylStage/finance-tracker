import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardTierSection from './CardTierSection';
import { ConfirmProvider } from './ConfirmProvider';

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put, del: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

// 이름은 지어낸 것이다. 실제 보유 카드 이름을 쓰지 않는다 — 이 저장소는 공개다.
const CARDS = [{ id: 7, issuer: '예시카드사', product_name: '구간형 예시카드' }];

const TIERS = [
  { id: 1, min_spend: 0, rate: 1, label: null },
  { id: 2, min_spend: 400000, rate: 2, label: '40만원 이상' },
];

function mockApi({ tiers = TIERS, cards = CARDS, tiersFails = false } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: cards });
    if (url.startsWith('/api/card-strategy/tiers/')) {
      return tiersFails
        ? Promise.reject(new Error('구간 조회 실패'))
        : Promise.resolve({ data: tiers });
    }
    return Promise.resolve({ data: [] });
  });
  put.mockResolvedValue({ ok: true, data: tiers });
}

const renderSection = () => render(<ConfirmProvider><CardTierSection /></ConfirmProvider>);

// 카드를 고르면 그 카드의 구간을 읽는다. 읽기가 끝날 때까지 기다린다 —
// 안 기다리면 아직 비어 있는 목록을 보고 통과한다.
async function pickCard(user) {
  const select = await screen.findByLabelText('카드');
  await user.selectOptions(select, '7');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('구간 칸 고치기', () => {
  it('하한·적립률·이름을 각각 고칠 수 있다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    const mins = screen.getAllByLabelText('실적 하한');
    await user.clear(mins[0]);
    await user.type(mins[0], '50000');
    expect(mins[0].value).toBe('50000');

    const rates = screen.getAllByLabelText('적립률 %');
    await user.clear(rates[1]);
    await user.type(rates[1], '3');
    expect(rates[1].value).toBe('3');

    const labels = screen.getAllByLabelText('이름 (선택)');
    await user.type(labels[0], '기본 구간');
    expect(labels[0].value).toBe('기본 구간');
  });

  it('한 칸을 고쳐도 다른 행은 그대로다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    const mins = screen.getAllByLabelText('실적 하한');
    await user.clear(mins[0]);
    await user.type(mins[0], '7');

    expect(mins[1].value).toBe('400000');
  });

  it('지우기를 누르면 그 행만 사라진다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    expect(screen.getAllByLabelText('실적 하한')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '1번째 구간 지우기' }));

    const left = screen.getAllByLabelText('실적 하한');
    expect(left).toHaveLength(1);
    // 남은 것은 둘째 행이다
    expect(left[0].value).toBe('400000');
  });
});

describe('구간 불러오기', () => {
  it('요율이 비어 있는 구간은 빈 칸으로 연다', async () => {
    mockApi({ tiers: [{ id: 3, min_spend: 100000, rate: null, label: '기본' }] });
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('100000');

    expect(screen.getByLabelText('적립률 %').value).toBe('');
  });

  it('구간이 없으면 더해 보라고 말한다', async () => {
    mockApi({ tiers: [] });
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);

    expect(await screen.findByText('등록된 구간이 없어요. 구간을 더해 보세요.')).toBeTruthy();
  });

  it('구간을 못 읽으면 이유를 화면에 남긴다', async () => {
    mockApi({ tiersFails: true });
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);

    expect(await screen.findByText('구간 조회 실패')).toBeTruthy();
  });

  it('카드 목록 응답에 목록 칸이 없어도 버틴다', async () => {
    get.mockImplementation((url) => {
      if (url.startsWith('/api/card-products')) return Promise.resolve({});
      return Promise.resolve({ data: [] });
    });
    renderSection();
    const select = await screen.findByLabelText('카드');
    // «선택...» 하나뿐이다
    expect(select.querySelectorAll('option')).toHaveLength(1);
  });

  it('카드 목록을 못 읽어도 화면은 뜬다', async () => {
    get.mockImplementation((url) => {
      if (url.startsWith('/api/card-products')) return Promise.reject(new Error('끊김'));
      return Promise.resolve({ data: [] });
    });
    renderSection();
    const select = await screen.findByLabelText('카드');
    expect(select.querySelectorAll('option')).toHaveLength(1);
  });
});

describe('저장', () => {
  it('하한이 두 번이면 경고를 닫아도 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    // 둘째 행의 하한을 첫째와 같게 만든다
    const mins = screen.getAllByLabelText('실적 하한');
    await user.clear(mins[1]);
    await user.type(mins[1], '0');

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText(/두 번 있습니다/)).toBeTruthy());
    expect(put).not.toHaveBeenCalled();

    // 경고를 닫는다. 닫은 뒤에도 저장은 나가지 않는다 —
    // 확인을 눌렀다고 «그래도 저장» 이 되면 막은 의미가 없다.
    await user.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByText(/두 번 있습니다/)).toBe(null));
    expect(put).not.toHaveBeenCalled();
  });

  it('적립률이 비어 있으면 요율 없이 보낸다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    const rates = screen.getAllByLabelText('적립률 %');
    await user.clear(rates[0]);

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const sent = put.mock.calls[0][1].tiers;
    expect(sent[0].rate).toBe(null);
    expect(sent[1].rate).toBe(2);
  });

  it('저장이 실패하면 이유를 알린다', async () => {
    put.mockRejectedValue(new Error('저장 거부됨'));
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('저장 거부됨')).toBeTruthy();
  });
});

describe('값이 없을 때 대신 쓰는 것', () => {
  it('구간 응답에 목록 칸이 없으면 빈 목록으로 연다', async () => {
    get.mockImplementation((url) => {
      if (url.startsWith('/api/card-products')) return Promise.resolve({ data: CARDS });
      if (url.startsWith('/api/card-strategy/tiers/')) return Promise.resolve({});
      return Promise.resolve({ data: [] });
    });
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);

    expect(await screen.findByText('등록된 구간이 없어요. 구간을 더해 보세요.')).toBeTruthy();
  });

  it('구간 조회가 이유 없이 실패하면 기본 문구를 적는다', async () => {
    get.mockImplementation((url) => {
      if (url.startsWith('/api/card-products')) return Promise.resolve({ data: CARDS });
      if (url.startsWith('/api/card-strategy/tiers/')) return Promise.reject(new Error(''));
      return Promise.resolve({ data: [] });
    });
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);

    expect(await screen.findByText('구간을 불러오지 못했습니다.')).toBeTruthy();
  });

  it('저장이 이유 없이 실패하면 기본 문구를 알린다', async () => {
    put.mockRejectedValue(new Error(''));
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('저장하지 못했습니다.')).toBeTruthy();
  });
});

describe('저장할 때 걸러지는 것', () => {
  it('하한을 안 적은 행은 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    // 빈 행을 하나 더한다 — 사용자가 «추가» 만 누르고 안 적은 상태다
    await user.click(screen.getByRole('button', { name: '+ 구간 추가' }));
    expect(screen.getAllByLabelText('실적 하한')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(put).toHaveBeenCalled());

    // 화면에는 세 행인데 나가는 것은 둘이다
    const sent = put.mock.calls[0][1].tiers;
    expect(sent).toHaveLength(2);
    expect(sent[0].min_spend).toBe(0);
    expect(sent[1].min_spend).toBe(400000);
  });

  it('요율이 비어 있던 구간은 그대로 저장해도 요율 없이 나간다', async () => {
    mockApi({ tiers: [{ id: 3, min_spend: 100000, rate: null, label: '기본' }] });
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('100000');

    // 아무것도 안 고치고 그대로 저장한다
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(put).toHaveBeenCalled());

    const sent = put.mock.calls[0][1].tiers;
    expect(sent).toHaveLength(1);
    expect(sent[0].rate).toBe(null);
    expect(sent[0].min_spend).toBe(100000);
  });

  it('저장하고 나면 서버에서 다시 읽어 온다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    await screen.findByDisplayValue('400000');

    const before = get.mock.calls.filter((c) => String(c[0]).includes('/tiers/')).length;

    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(put).toHaveBeenCalled());

    await waitFor(() => {
      const after = get.mock.calls.filter((c) => String(c[0]).includes('/tiers/')).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});
